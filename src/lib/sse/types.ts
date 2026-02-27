/**
 * SSE Type Definitions
 *
 * Svelte-native types for Server-Sent Events connections.
 */

/**
 * Connection status states
 */
export type SSEStatus =
	| 'idle'
	| 'connecting'
	| 'connected'
	| 'error'
	| 'closed'
	| 'paused'
	| 'offline';

/**
 * SSE error types for better error handling
 */
export type SSEErrorType = 'network' | 'server' | 'client' | 'timeout' | 'circuit-open';

/**
 * SSE error with type classification
 */
export interface SSEError extends Error {
	type: SSEErrorType;
	code?: number;
}

/**
 * SSE event handlers mapping
 *
 * Built-in events (connected, heartbeat, error) are excluded from the generic T
 * and have their own typed signatures.
 */
export type SSEHandlers<T> = {
	[K in keyof T as K extends 'connected' | 'heartbeat' | 'error' ? never : K]?: (
		data: T[K]
	) => void;
} & {
	/** Called when connection is established */
	connected?: (data: SSEConnectedEvent) => void;
	/** Called on heartbeat messages */
	heartbeat?: (data: SSEHeartbeatEvent) => void;
	/** Called when any error occurs */
	error?: (error: SSEError) => void;
};

/**
 * Configuration options for SSE connections
 */
export interface SSEOptions {
	/** Maximum number of retry attempts (default: Infinity) */
	maxRetries?: number;
	/** Initial retry delay in milliseconds (default: 1000) */
	baseDelay?: number;
	/** Maximum retry delay in milliseconds (default: 30000) */
	maxDelay?: number;
	/** Pause connection when tab is hidden (default: true) */
	pauseOnHidden?: boolean;
	/** Reconnect when tab becomes visible (default: true) */
	reconnectOnVisible?: boolean;
	/** Expected heartbeat interval in milliseconds (default: 60000) */
	heartbeatInterval?: number;
	/** Enable debug logging (default: false) */
	debug?: boolean;
	/** Enable connection sharing for same URL (default: false) */
	shared?: boolean;
	/** Circuit breaker: errors before opening circuit (default: 5) */
	circuitBreakerThreshold?: number;
	/** Circuit breaker: milliseconds before retrying (default: 30000) */
	circuitBreakerTimeout?: number;
}

/**
 * Reactive SSE state returned by createSSE
 */
export interface SSEState {
	/** Current connection status */
	readonly status: SSEStatus;
	/** Last error that occurred */
	readonly error: SSEError | null;
	/** Whether currently connected */
	readonly isConnected: boolean;
	/** Whether connection is paused (tab hidden) */
	readonly isPaused: boolean;
	/** Number of reconnection attempts */
	readonly reconnectCount: number;
	/** Whether circuit breaker is open */
	readonly isCircuitOpen: boolean;
	/** Whether max retries have been exceeded */
	readonly maxRetriesExceeded: boolean;
	/** Manually close the connection */
	close: () => void;
	/** Manually reconnect */
	reconnect: () => void;
}

/**
 * Internal connection metadata
 */
export interface SSEConnection {
	id: string;
	url: string;
	eventSource: EventSource | null;
	status: SSEStatus;
	refCount: number;
	lastActivity: number;
	errorCount: number;
	circuitOpenUntil: number;
	handlers: Map<string, Set<(data: unknown) => void>>;
}

/**
 * SSE event data structures
 */
export interface SSEConnectedEvent {
	timestamp: string;
}

export interface SSEHeartbeatEvent {
	timestamp: string;
}

/**
 * Default SSE configuration values
 */
export const DEFAULT_SSE_OPTIONS: Required<SSEOptions> = {
	maxRetries: 10,
	baseDelay: 1000,
	maxDelay: 30000,
	pauseOnHidden: true,
	reconnectOnVisible: true,
	heartbeatInterval: 60000,
	debug: false,
	shared: false,
	circuitBreakerThreshold: 5,
	circuitBreakerTimeout: 30000
};
