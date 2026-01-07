/**
 * Stalker Client Pool
 *
 * Manages a pool of authenticated StalkerStreamClient instances, one per account.
 * Handles concurrent requests, authentication, and re-auth on token expiration.
 */

import { logger } from '$lib/logging';
import { StalkerStreamClient, createStalkerStreamClient } from './StalkerStreamClient';
import { getStalkerAccountManager } from '$lib/server/livetv/stalker/StalkerAccountManager';
import type { ClientPoolConfig } from './types';
import {
	LIVETV_CLIENT_MAX_AUTH_RETRIES,
	LIVETV_CLIENT_AUTH_RETRY_DELAY_MS,
	LIVETV_CLIENT_TOKEN_REFRESH_MS,
	LIVETV_STREAM_REQUEST_TIMEOUT_MS
} from './constants';

interface PooledClientEntry {
	client: StalkerStreamClient;
	accountId: string;
	lastAuthAt: number;
	authAttempts: number;
	inUse: number; // Concurrent request count
}

const defaultConfig: ClientPoolConfig = {
	maxAuthRetries: LIVETV_CLIENT_MAX_AUTH_RETRIES,
	authRetryDelayMs: LIVETV_CLIENT_AUTH_RETRY_DELAY_MS,
	tokenRefreshMs: LIVETV_CLIENT_TOKEN_REFRESH_MS,
	requestTimeoutMs: LIVETV_STREAM_REQUEST_TIMEOUT_MS
};

export class StalkerClientPool {
	private clients = new Map<string, PooledClientEntry>();
	private authLocks = new Map<string, Promise<StalkerStreamClient>>();
	private config: ClientPoolConfig;

	constructor(config: Partial<ClientPoolConfig> = {}) {
		this.config = { ...defaultConfig, ...config };
	}

	/**
	 * Get an authenticated client for the given account.
	 * Creates and authenticates if needed, with lock to prevent duplicate auths.
	 */
	async getClient(accountId: string): Promise<StalkerStreamClient> {
		// Check for existing valid client
		const existing = this.clients.get(accountId);
		if (existing && this.isClientValid(existing)) {
			existing.inUse++;
			logger.debug('[StalkerClientPool] Reusing existing client', {
				accountId,
				inUse: existing.inUse
			});
			return existing.client;
		}

		// Check for in-progress authentication
		const pending = this.authLocks.get(accountId);
		if (pending) {
			logger.debug('[StalkerClientPool] Waiting for pending auth', { accountId });
			const client = await pending;
			const entry = this.clients.get(accountId);
			if (entry) entry.inUse++;
			return client;
		}

		// Start new authentication with lock
		const authPromise = this.createAndAuthClient(accountId);
		this.authLocks.set(accountId, authPromise);

		try {
			const client = await authPromise;
			return client;
		} finally {
			this.authLocks.delete(accountId);
		}
	}

	/**
	 * Check if a pooled client is still valid
	 */
	private isClientValid(entry: PooledClientEntry): boolean {
		// Check if client exists and has token
		if (!entry.client.hasToken()) {
			return false;
		}

		// Check if token needs refresh (older than tokenRefreshMs)
		const tokenAge = Date.now() - entry.lastAuthAt;
		if (tokenAge > this.config.tokenRefreshMs) {
			logger.debug('[StalkerClientPool] Token needs refresh', {
				accountId: entry.accountId,
				tokenAgeMinutes: Math.round(tokenAge / 1000 / 60)
			});
			return false;
		}

		return true;
	}

	/**
	 * Create and authenticate a new client for an account
	 */
	private async createAndAuthClient(accountId: string): Promise<StalkerStreamClient> {
		// Get account details from database
		const account = await getStalkerAccountManager().getAccount(accountId);
		if (!account) {
			throw new Error(`Account not found: ${accountId}`);
		}

		if (!account.enabled) {
			throw new Error(`Account is disabled: ${accountId}`);
		}

		const client = createStalkerStreamClient(account.portalUrl, account.macAddress);

		// Authenticate with retry
		let lastError: Error | null = null;
		for (let attempt = 0; attempt < this.config.maxAuthRetries; attempt++) {
			try {
				logger.debug('[StalkerClientPool] Attempting handshake', {
					accountId,
					attempt: attempt + 1,
					maxAttempts: this.config.maxAuthRetries
				});

				await client.handshake();

				// Store in pool
				this.clients.set(accountId, {
					client,
					accountId,
					lastAuthAt: Date.now(),
					authAttempts: attempt + 1,
					inUse: 1
				});

				logger.info('[StalkerClientPool] Client authenticated', {
					accountId,
					attempts: attempt + 1
				});

				return client;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				logger.warn('[StalkerClientPool] Auth attempt failed', {
					accountId,
					attempt: attempt + 1,
					error: lastError.message
				});

				if (attempt < this.config.maxAuthRetries - 1) {
					// Exponential backoff
					const delay = this.config.authRetryDelayMs * Math.pow(2, attempt);
					await this.delay(delay);
				}
			}
		}

		throw new Error(
			`Authentication failed after ${this.config.maxAuthRetries} attempts: ${lastError?.message}`
		);
	}

	/**
	 * Release a client back to the pool after use
	 */
	release(accountId: string): void {
		const entry = this.clients.get(accountId);
		if (entry && entry.inUse > 0) {
			entry.inUse--;
			logger.debug('[StalkerClientPool] Client released', {
				accountId,
				remainingUse: entry.inUse
			});
		}
	}

	/**
	 * Invalidate a client (e.g., on auth failure during request)
	 */
	invalidate(accountId: string): void {
		const deleted = this.clients.delete(accountId);
		if (deleted) {
			logger.info('[StalkerClientPool] Client invalidated', { accountId });
		}
	}

	/**
	 * Invalidate all clients (e.g., on shutdown)
	 */
	invalidateAll(): void {
		const count = this.clients.size;
		this.clients.clear();
		if (count > 0) {
			logger.info('[StalkerClientPool] All clients invalidated', { count });
		}
	}

	/**
	 * Get pool statistics
	 */
	getStats(): {
		pooledClients: number;
		totalInUse: number;
		accounts: Array<{ accountId: string; inUse: number; lastAuthAt: number }>;
	} {
		const accounts = Array.from(this.clients.entries()).map(([accountId, entry]) => ({
			accountId,
			inUse: entry.inUse,
			lastAuthAt: entry.lastAuthAt
		}));

		return {
			pooledClients: this.clients.size,
			totalInUse: accounts.reduce((sum, a) => sum + a.inUse, 0),
			accounts
		};
	}

	/**
	 * Check if a client is currently pooled for an account
	 */
	hasClient(accountId: string): boolean {
		return this.clients.has(accountId);
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// Singleton instance
let clientPoolInstance: StalkerClientPool | null = null;

/**
 * Get the singleton StalkerClientPool instance
 */
export function getStalkerClientPool(): StalkerClientPool {
	if (!clientPoolInstance) {
		clientPoolInstance = new StalkerClientPool();
	}
	return clientPoolInstance;
}
