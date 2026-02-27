import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	classifyError,
	createSSEError,
	getSharedConnection,
	registerConnection,
	acquireConnection,
	releaseConnection,
	updateConnectionStatus,
	recordConnectionError,
	isCircuitOpen,
	openCircuit,
	createConnection,
	getActiveConnections,
	closeAllConnections
} from './connection-pool.js';
import type { SSEConnection, SSEStatus, SSEErrorType } from './types.js';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

describe('Connection Pool', () => {
	beforeEach(() => {
		// Clear all connections before each test
		closeAllConnections();
	});

	afterEach(() => {
		closeAllConnections();
	});

	describe('classifyError', () => {
		it('should classify timeout errors', () => {
			const error = new Error('Connection timeout ETIMEDOUT');
			const result = classifyError(error);
			expect(result.type).toBe('timeout');
		});

		it('should classify network errors', () => {
			const error = new Error('ECONNREFUSED connection refused');
			const result = classifyError(error);
			expect(result.type).toBe('network');
		});

		it('should classify generic Error as client error', () => {
			const error = new Error('Some error');
			const result = classifyError(error);
			expect(result.type).toBe('client');
		});

		it('should classify Event errors as network', () => {
			const event = new Event('error');
			const result = classifyError(event);
			expect(result.type).toBe('network');
		});
	});

	describe('createSSEError', () => {
		it('should create error with type and code', () => {
			const error = createSSEError('network', 'Connection failed', 500);
			expect(error.type).toBe('network');
			expect(error.message).toBe('Connection failed');
			expect(error.code).toBe(500);
		});
	});

	describe('createConnection', () => {
		it('should create connection with default values', () => {
			const conn = createConnection('ws://test');
			expect(conn.url).toBe('ws://test');
			expect(conn.status).toBe('idle');
			expect(conn.refCount).toBe(1);
			expect(conn.errorCount).toBe(0);
			expect(conn.circuitOpenUntil).toBe(0);
			expect(conn.handlers.size).toBe(0);
			expect(conn.id).toMatch(/^sse-\d+-[a-z0-9]+$/);
		});
	});

	describe('registerConnection', () => {
		it('should register connection in pool', () => {
			const conn = createConnection('ws://test');
			registerConnection('ws://test', conn);
			const retrieved = getSharedConnection('ws://test');
			expect(retrieved).toBe(conn);
		});
	});

	describe('acquireConnection', () => {
		it('should increment refCount when acquiring', () => {
			const conn = createConnection('ws://test');
			registerConnection('ws://test', conn);

			const acquired = acquireConnection('ws://test');
			expect(acquired).toBe(conn);
			expect(conn.refCount).toBe(2);
		});

		it('should return null for non-existent connection', () => {
			const result = acquireConnection('ws://nonexistent');
			expect(result).toBeNull();
		});
	});

	describe('releaseConnection', () => {
		it('should decrement refCount when releasing', () => {
			const conn = createConnection('ws://test');
			conn.refCount = 2;
			registerConnection('ws://test', conn);

			releaseConnection('ws://test');
			expect(conn.refCount).toBe(1);
		});

		it('should remove connection when refCount reaches 0', () => {
			const conn = createConnection('ws://test');
			registerConnection('ws://test', conn);

			releaseConnection('ws://test');
			const retrieved = getSharedConnection('ws://test');
			expect(retrieved).toBeNull();
		});

		it('should close EventSource when removing connection', () => {
			const conn = createConnection('ws://test');
			const mockClose = vi.fn();
			conn.eventSource = { close: mockClose } as unknown as EventSource;
			registerConnection('ws://test', conn);

			releaseConnection('ws://test');
			expect(mockClose).toHaveBeenCalled();
			expect(conn.eventSource).toBeNull();
		});
	});

	describe('updateConnectionStatus', () => {
		it('should update status and reset error count on connect', () => {
			const conn = createConnection('ws://test');
			conn.errorCount = 5;
			conn.lastActivity = 0;
			registerConnection('ws://test', conn);

			updateConnectionStatus('ws://test', 'connected');
			expect(conn.status).toBe('connected');
			expect(conn.errorCount).toBe(0);
			expect(conn.lastActivity).toBeGreaterThan(0);
		});

		it('should update status to error', () => {
			const conn = createConnection('ws://test');
			registerConnection('ws://test', conn);

			updateConnectionStatus('ws://test', 'error');
			expect(conn.status).toBe('error');
		});
	});

	describe('recordConnectionError', () => {
		it('should increment error count', () => {
			const conn = createConnection('ws://test');
			registerConnection('ws://test', conn);

			recordConnectionError('ws://test');
			expect(conn.errorCount).toBe(1);

			recordConnectionError('ws://test');
			expect(conn.errorCount).toBe(2);
		});
	});

	describe('Circuit Breaker', () => {
		it('should open circuit after threshold errors', () => {
			const conn = createConnection('ws://test');
			conn.errorCount = 5;
			registerConnection('ws://test', conn);

			const isOpen = isCircuitOpen('ws://test', 5);
			expect(isOpen).toBe(false); // Not open yet, needs timeout set
		});

		it('should open circuit when timeout is set', () => {
			const conn = createConnection('ws://test');
			conn.errorCount = 5;
			conn.circuitOpenUntil = Date.now() + 10000; // 10 seconds in future
			registerConnection('ws://test', conn);

			const isOpen = isCircuitOpen('ws://test', 5);
			expect(isOpen).toBe(true);
		});

		it('should reset circuit after timeout expires', () => {
			const conn = createConnection('ws://test');
			conn.errorCount = 5;
			conn.circuitOpenUntil = Date.now() - 1000; // 1 second in past
			registerConnection('ws://test', conn);

			const isOpen = isCircuitOpen('ws://test', 5);
			expect(isOpen).toBe(false);
			expect(conn.errorCount).toBe(0); // Reset
		});

		it('should open circuit with openCircuit', () => {
			const conn = createConnection('ws://test');
			registerConnection('ws://test', conn);

			openCircuit('ws://test', 30000);
			expect(conn.circuitOpenUntil).toBeGreaterThan(Date.now());
		});
	});

	describe('getActiveConnections', () => {
		it('should return all active connections', () => {
			const conn1 = createConnection('ws://test1');
			const conn2 = createConnection('ws://test2');
			registerConnection('ws://test1', conn1);
			registerConnection('ws://test2', conn2);

			const active = getActiveConnections();
			expect(active).toHaveLength(2);
			expect(active).toContain(conn1);
			expect(active).toContain(conn2);
		});
	});

	describe('closeAllConnections', () => {
		it('should close all connections and clear pool', () => {
			const conn1 = createConnection('ws://test1');
			const conn2 = createConnection('ws://test2');
			const mockClose1 = vi.fn();
			const mockClose2 = vi.fn();
			conn1.eventSource = { close: mockClose1 } as unknown as EventSource;
			conn2.eventSource = { close: mockClose2 } as unknown as EventSource;
			registerConnection('ws://test1', conn1);
			registerConnection('ws://test2', conn2);

			closeAllConnections();

			expect(mockClose1).toHaveBeenCalled();
			expect(mockClose2).toHaveBeenCalled();
			expect(getActiveConnections()).toHaveLength(0);
		});
	});
});
