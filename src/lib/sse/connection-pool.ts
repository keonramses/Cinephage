/**
 * SSE Connection Pool
 *
 * Manages shared SSE connections with reference counting.
 */

import { browser } from '$app/environment';
import type { SSEConnection, SSEStatus, SSEError, SSEErrorType } from './types.js';

/**
 * Global connection registry
 */
const connectionPool = new Map<string, SSEConnection>();

/**
 * Generate unique connection ID
 */
function generateConnectionId(): string {
	return `sse-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Classify error type from EventSource error event
 */
export function classifyError(error: Event | Error): { type: SSEErrorType; message: string } {
	if (error instanceof Error) {
		if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
			return { type: 'timeout', message: error.message };
		}
		if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
			return { type: 'network', message: error.message };
		}
		return { type: 'client', message: error.message };
	}

	// EventSource errors don't provide much info
	return { type: 'network', message: 'Connection failed' };
}

/**
 * Create SSE error object
 */
export function createSSEError(type: SSEErrorType, message: string, code?: number): SSEError {
	const error = new Error(message) as SSEError;
	error.type = type;
	error.code = code;
	return error;
}

/**
 * Get or create a shared connection
 */
export function getSharedConnection(url: string): SSEConnection | null {
	if (!browser) return null;
	return connectionPool.get(url) || null;
}

/**
 * Register a connection in the pool
 */
export function registerConnection(url: string, connection: SSEConnection): void {
	if (!browser) return;
	connectionPool.set(url, connection);
}

/**
 * Increment reference count for a connection
 */
export function acquireConnection(url: string): SSEConnection | null {
	if (!browser) return null;

	const conn = connectionPool.get(url);
	if (conn) {
		conn.refCount++;
		return conn;
	}
	return null;
}

/**
 * Decrement reference count and cleanup if needed
 */
export function releaseConnection(url: string): void {
	if (!browser) return;

	const conn = connectionPool.get(url);
	if (!conn) return;

	conn.refCount--;

	if (conn.refCount <= 0) {
		// Close the connection
		if (conn.eventSource) {
			conn.eventSource.close();
			conn.eventSource = null;
		}
		connectionPool.delete(url);
	}
}

/**
 * Update connection status
 */
export function updateConnectionStatus(url: string, status: SSEStatus): void {
	const conn = connectionPool.get(url);
	if (conn) {
		conn.status = status;
		if (status === 'connected') {
			conn.lastActivity = Date.now();
			conn.errorCount = 0;
		}
	}
}

/**
 * Record connection error
 * Opens circuit breaker when error threshold is reached
 */
export function recordConnectionError(url: string, threshold: number, timeout: number): void {
	const conn = connectionPool.get(url);
	if (conn) {
		conn.errorCount++;
		// Open circuit when threshold is reached
		if (conn.errorCount >= threshold) {
			conn.circuitOpenUntil = Date.now() + timeout;
		}
	}
}

/**
 * Check if circuit breaker is open
 */
export function isCircuitOpen(url: string, threshold: number): boolean {
	const conn = connectionPool.get(url);
	if (!conn) return false;

	if (conn.errorCount >= threshold) {
		// Check if timeout has elapsed
		if (Date.now() < conn.circuitOpenUntil) {
			return true;
		}
		// Reset circuit
		conn.errorCount = 0;
	}
	return false;
}

/**
 * Open circuit breaker
 */
export function openCircuit(url: string, timeout: number): void {
	const conn = connectionPool.get(url);
	if (conn) {
		conn.circuitOpenUntil = Date.now() + timeout;
	}
}

/**
 * Add event handler to connection
 */
export function addHandler(url: string, eventName: string, handler: (data: unknown) => void): void {
	const conn = connectionPool.get(url);
	if (!conn) return;

	if (!conn.handlers.has(eventName)) {
		conn.handlers.set(eventName, new Set());
	}
	conn.handlers.get(eventName)!.add(handler);

	// Attach to EventSource if it exists
	if (conn.eventSource) {
		conn.eventSource.addEventListener(eventName, (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				handler(data);
			} catch {
				handler(e.data);
			}
		});
	}
}

/**
 * Remove event handler from connection
 */
export function removeHandler(
	url: string,
	eventName: string,
	handler: (data: unknown) => void
): void {
	const conn = connectionPool.get(url);
	if (!conn) return;

	const handlers = conn.handlers.get(eventName);
	if (handlers) {
		handlers.delete(handler);
		if (handlers.size === 0) {
			conn.handlers.delete(eventName);
		}
	}
}

/**
 * Create a new connection object
 */
export function createConnection(url: string): SSEConnection {
	return {
		id: generateConnectionId(),
		url,
		eventSource: null,
		status: 'idle',
		refCount: 1,
		lastActivity: Date.now(),
		errorCount: 0,
		circuitOpenUntil: 0,
		handlers: new Map()
	};
}

/**
 * Get all active connections (for debugging)
 */
export function getActiveConnections(): SSEConnection[] {
	return Array.from(connectionPool.values());
}

/**
 * Close all connections (cleanup)
 */
export function closeAllConnections(): void {
	connectionPool.forEach((conn) => {
		if (conn.eventSource) {
			conn.eventSource.close();
			conn.eventSource = null;
		}
	});
	connectionPool.clear();
}
