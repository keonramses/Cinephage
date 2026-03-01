/**
 * createSSE - Svelte-native Server-Sent Events hook
 *
 * A fully reactive SSE connection manager using Svelte 5 runes.
 * Automatically handles lifecycle, cleanup, reconnection, and tab visibility.
 *
 * @example
 * const sse = createSSE('/api/stream', {
 *   'event:name': (data) => console.log(data)
 * });
 *
 * {#if sse.isConnected}
 *   <span>Connected</span>
 * {/if}
 */

import { browser } from '$app/environment';
import { afterNavigate, beforeNavigate } from '$app/navigation';
import type {
	SSEHandlers,
	SSEOptions,
	SSEState,
	SSEStatus,
	SSEError,
	SSEConnectedEvent,
	SSEHeartbeatEvent
} from './types.js';
import { DEFAULT_SSE_OPTIONS } from './types.js';
import {
	registerConnection,
	acquireConnection,
	releaseConnection,
	updateConnectionStatus,
	recordConnectionError,
	isCircuitOpen,
	openCircuit,
	createConnection,
	classifyError,
	createSSEError
} from './connection-pool.js';

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
	return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
}

/**
 * Create a reactive SSE connection
 *
 * @param url - SSE endpoint URL
 * @param handlers - Event handlers map
 * @param options - Configuration options
 * @returns Reactive SSE state object
 */
export function createSSE<T = Record<string, unknown>>(
	url: string,
	handlers: SSEHandlers<T>,
	options: SSEOptions = {}
): SSEState {
	// Merge with defaults
	const config = { ...DEFAULT_SSE_OPTIONS, ...options };

	// Reactive state using Svelte 5 runes
	let status = $state<SSEStatus>('idle');
	let error = $state<SSEError | null>(null);
	let reconnectCount = $state(0);
	let isPaused = $state(false);
	let circuitBreakerOpen = $state(false);
	let maxRetriesExceeded = $state(false);

	// Internal state (not reactive)
	let eventSource: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let isManuallyClosed = false;
	let lastUrl = url;

	// Store event listener references for cleanup
	const activeListeners: Array<{ event: string; handler: (e: MessageEvent) => void }> = [];

	/**
	 * Debug logging
	 */
	function debug(...args: unknown[]): void {
		if (config.debug) {
			console.log('[SSE]', ...args);
		}
	}

	/**
	 * Update status and sync with connection pool
	 */
	function setStatus(newStatus: SSEStatus): void {
		status = newStatus;
		if (config.shared) {
			updateConnectionStatus(url, newStatus);
		}
	}

	/**
	 * Send heartbeat to keep connection alive
	 */
	function setupHeartbeat(): void {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
		}

		heartbeatTimer = setInterval(() => {
			if (eventSource?.readyState === EventSource.OPEN) {
				// Connection is still open, update activity
				debug('Heartbeat check - connection alive');
			}
		}, config.heartbeatInterval);
	}

	/**
	 * Clear all timers
	 */
	function clearTimers(): void {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	/**
	 * Close current connection
	 */
	function closeConnection(): void {
		clearTimers();

		if (eventSource) {
			// Remove all event listeners before closing
			for (const { event, handler } of activeListeners) {
				// Cast handler to EventListener for removeEventListener
				eventSource.removeEventListener(event, handler as EventListener);
			}
			activeListeners.length = 0;

			eventSource.close();
			eventSource = null;
		}

		if (config.shared) {
			releaseConnection(url);
		}

		setStatus('closed');
	}

	/**
	 * Attempt to connect
	 */
	function connect(): void {
		if (!browser || isManuallyClosed || isPaused) {
			return;
		}

		// Check circuit breaker
		if (config.shared && isCircuitOpen(url, config.circuitBreakerThreshold)) {
			debug('Circuit breaker open, skipping connection');
			circuitBreakerOpen = true;
			setStatus('error');
			error = createSSEError('circuit-open', 'Too many errors, cooling down');

			// Schedule retry after circuit timeout
			reconnectTimer = setTimeout(() => {
				circuitBreakerOpen = false;
				connect();
			}, config.circuitBreakerTimeout);
			return;
		}

		circuitBreakerOpen = false;

		// Check if already connected
		if (eventSource?.readyState === EventSource.OPEN) {
			debug('Already connected');
			return;
		}

		// Close existing connection
		closeConnection();

		setStatus('connecting');
		debug('Connecting to:', url);

		try {
			// Try to use shared connection
			if (config.shared) {
				const shared = acquireConnection(url);
				if (shared?.eventSource?.readyState === EventSource.OPEN) {
					debug('Using shared connection');
					eventSource = shared.eventSource;
					setStatus('connected');
					setupHeartbeat();
					return;
				}
			}

			// Create new connection
			eventSource = new EventSource(url);

			if (config.shared) {
				const conn = createConnection(url);
				conn.eventSource = eventSource;
				registerConnection(url, conn);
			}

			// Handle connection open
			const onOpen = () => {
				debug('Connection opened');
				setStatus('connected');
				reconnectCount = 0;
				error = null;
				setupHeartbeat();
			};
			eventSource.addEventListener('open', onOpen);
			activeListeners.push({ event: 'open', handler: onOpen });

			// Handle connected event (custom)
			const onConnected = (e: MessageEvent) => {
				try {
					const data = JSON.parse(e.data) as SSEConnectedEvent;
					debug('Connected event:', data);
					handlers.connected?.(data);
				} catch (err) {
					debug('Failed to parse connected event:', err);
				}
			};
			eventSource.addEventListener('connected', onConnected);
			activeListeners.push({ event: 'connected', handler: onConnected });

			// Handle heartbeat
			const onHeartbeat = (e: MessageEvent) => {
				try {
					const data = JSON.parse(e.data) as SSEHeartbeatEvent;
					handlers.heartbeat?.(data);
				} catch {
					// Ignore parse errors for heartbeat
				}
			};
			eventSource.addEventListener('heartbeat', onHeartbeat);
			activeListeners.push({ event: 'heartbeat', handler: onHeartbeat });

			// Wire up custom event handlers
			for (const [eventName, handler] of Object.entries(handlers)) {
				if (eventName === 'connected' || eventName === 'heartbeat' || eventName === 'error') {
					continue;
				}

				const listener = (e: MessageEvent) => {
					try {
						const data = JSON.parse(e.data);
						debug(`Event: ${eventName}`, data);
						handler?.(data);
					} catch (err) {
						debug(`Failed to parse event "${eventName}":`, err);
					}
				};
				eventSource.addEventListener(eventName, listener);
				activeListeners.push({ event: eventName, handler: listener });
			}

			// Handle errors
			eventSource.onerror = (e) => {
				if (isManuallyClosed) return;

				const { type, message } = classifyError(e);
				error = createSSEError(type, message);

				debug('Connection error:', type, message);

				if (config.shared) {
					recordConnectionError(url, config.circuitBreakerThreshold, config.circuitBreakerTimeout);
				}

				handlers.error?.(error);

				// Close current connection
				closeConnection();

				// Check if we should retry
				if (reconnectCount < config.maxRetries) {
					setStatus('error');

					const delay = getBackoffDelay(reconnectCount, config.baseDelay, config.maxDelay);
					debug(`Reconnecting in ${delay}ms (attempt ${reconnectCount + 1})`);

					reconnectTimer = setTimeout(() => {
						reconnectCount++;
						connect();
					}, delay);
				} else {
					debug('Max retries reached, giving up');
					setStatus('error');
					maxRetriesExceeded = true;
					if (config.shared) {
						openCircuit(url, config.circuitBreakerTimeout);
					}
				}
			};
		} catch (err) {
			debug('Failed to create EventSource:', err);
			const message = err instanceof Error ? err.message : 'Unknown error';
			error = createSSEError('client', message);
			setStatus('error');
			handlers.error?.(error);
		}
	}

	/**
	 * Manual close function
	 */
	function close(): void {
		debug('Manual close called');
		isManuallyClosed = true;
		closeConnection();
	}

	/**
	 * Manual reconnect function
	 */
	function reconnect(): void {
		debug('Manual reconnect called');
		isManuallyClosed = false;
		reconnectCount = 0;
		maxRetriesExceeded = false;
		connect();
	}

	// Main connection lifecycle using SvelteKit navigation hooks
	// Connect AFTER navigation completes to avoid "interrupted while loading" errors
	afterNavigate(() => {
		if (!browser) return;
		connect();
	});

	// Close connection BEFORE navigation starts to prevent interrupted connections
	beforeNavigate(() => {
		isManuallyClosed = true;
		closeConnection();
	});

	// Cleanup on component destroy (for non-navigation scenarios)
	$effect(() => {
		return () => {
			debug('Cleaning up connection');
			closeConnection();
		};
	});

	// Watch for URL changes (for reactive URLs)
	$effect(() => {
		if (url !== lastUrl) {
			debug('URL changed, reconnecting');
			lastUrl = url;
			reconnectCount = 0;
			isManuallyClosed = false;
			connect();
		}
	});

	// Tab visibility handling
	$effect(() => {
		if (!browser || !config.pauseOnHidden) return;

		function handleVisibilityChange(): void {
			if (document.hidden) {
				debug('Tab hidden, pausing connection');
				isPaused = true;
				closeConnection();
				setStatus('paused');
			} else if (config.reconnectOnVisible) {
				debug('Tab visible, resuming connection');
				isPaused = false;
				connect();
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// Network status handling
	$effect(() => {
		if (!browser) return;

		function handleOnline(): void {
			debug('Network online');
			if (status === 'offline') {
				connect();
			}
		}

		function handleOffline(): void {
			debug('Network offline');
			setStatus('offline');
			closeConnection();
		}

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});

	// Return reactive state object (Svelte-compatible)
	return {
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		get isConnected() {
			return status === 'connected';
		},
		get isPaused() {
			return isPaused;
		},
		get reconnectCount() {
			return reconnectCount;
		},
		get isCircuitOpen() {
			return circuitBreakerOpen;
		},
		get maxRetriesExceeded() {
			return maxRetriesExceeded;
		},
		close,
		reconnect
	};
}

/**
 * Create a reactive SSE connection with dynamic URL
 *
 * Automatically reconnects when the URL changes.
 *
 * @example
 * const sse = createDynamicSSE(
 *   () => `/api/stream?id=${movieId}`,
 *   { 'event': handler }
 * );
 */
export function createDynamicSSE<T = Record<string, unknown>>(
	getUrl: () => string,
	handlers: SSEHandlers<T>,
	options: SSEOptions = {}
): SSEState {
	// Track current URL reactively
	let currentUrl = $state(getUrl());

	// Watch for URL changes
	$effect(() => {
		const newUrl = getUrl();
		if (newUrl !== currentUrl) {
			currentUrl = newUrl;
		}
	});

	// Create SSE with reactive URL
	return createSSE(currentUrl, handlers, options);
}

/**
 * Create a shared SSE connection
 *
 * Multiple components can share the same connection.
 * Connection is only closed when all components unmount.
 *
 * @example
 * const sse = createSharedSSE('/api/stream', {
 *   'event': handler
 * });
 */
export function createSharedSSE<T = Record<string, unknown>>(
	url: string,
	handlers: SSEHandlers<T>,
	options: SSEOptions = {}
): SSEState {
	return createSSE(url, handlers, { ...options, shared: true });
}
