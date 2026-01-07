/**
 * Stalker Stream Service
 *
 * Main orchestration service for Live TV streaming.
 * Handles stream URL resolution with caching, authentication, and failover.
 */

import { logger } from '$lib/logging';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import { getStreamUrlCache } from './StreamUrlCache';
import { getStalkerClientPool } from './StalkerClientPool';
import type { StreamResult, StreamSource, StreamError, StreamErrorCode } from './types';

export class StalkerStreamService {
	private urlCache = getStreamUrlCache();
	private clientPool = getStalkerClientPool();

	// Metrics
	private totalResolutions = 0;
	private cacheHits = 0;
	private cacheMisses = 0;
	private failovers = 0;

	/**
	 * Get stream URL for a lineup item with failover support.
	 * Tries primary source first, then backups in priority order.
	 */
	async getStreamUrl(lineupItemId: string): Promise<StreamResult> {
		this.totalResolutions++;

		// Get lineup item with backups
		const item = await channelLineupService.getChannelWithBackups(lineupItemId);
		if (!item) {
			throw this.createError('LINEUP_ITEM_NOT_FOUND', `Lineup item not found: ${lineupItemId}`);
		}

		// Build source list: primary first, then backups in priority order
		const sources: StreamSource[] = [
			{
				accountId: item.accountId,
				channelId: item.channelId,
				cmd: item.channel.cmd,
				priority: 0
			}
		];

		for (const backup of item.backups) {
			sources.push({
				accountId: backup.accountId,
				channelId: backup.channelId,
				cmd: backup.channel.cmd,
				priority: backup.priority
			});
		}

		// Try each source
		const errors: Array<{ source: StreamSource; error: Error }> = [];

		for (const source of sources) {
			try {
				const result = await this.resolveStreamWithRetry(
					source.accountId,
					source.channelId,
					source.cmd,
					lineupItemId
				);

				// If we used a backup, log it
				if (source.priority > 0) {
					this.failovers++;
					logger.info('[StalkerStreamService] Used backup source', {
						lineupItemId,
						primaryAccountId: sources[0].accountId,
						backupAccountId: source.accountId,
						backupPriority: source.priority
					});
				}

				return result;
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				errors.push({ source, error: err });

				logger.warn('[StalkerStreamService] Source failed', {
					lineupItemId,
					accountId: source.accountId,
					channelId: source.channelId,
					priority: source.priority,
					error: err.message,
					remainingSources: sources.length - errors.length
				});
			}
		}

		// All sources failed
		const errorMessages = errors.map((e) => `[${e.source.priority}] ${e.error.message}`).join('; ');
		throw this.createError(
			'ALL_SOURCES_FAILED',
			`All ${sources.length} sources failed: ${errorMessages}`,
			sources[0].accountId,
			sources[0].channelId,
			sources.length
		);
	}

	/**
	 * Resolve a stream with automatic retry on auth failure
	 */
	private async resolveStreamWithRetry(
		accountId: string,
		channelId: string,
		cmd: string,
		lineupItemId: string,
		isRetry: boolean = false
	): Promise<StreamResult> {
		try {
			return await this.resolveStream(accountId, channelId, cmd, lineupItemId);
		} catch (error) {
			// On auth-like errors, retry once with fresh auth
			if (!isRetry && this.isAuthError(error)) {
				logger.info('[StalkerStreamService] Auth error, retrying with fresh auth', {
					accountId,
					channelId
				});

				// Invalidate client and cache for this account
				this.clientPool.invalidate(accountId);
				this.urlCache.invalidateAccount(accountId);

				return this.resolveStreamWithRetry(accountId, channelId, cmd, lineupItemId, true);
			}
			throw error;
		}
	}

	/**
	 * Resolve a single stream source
	 */
	private async resolveStream(
		accountId: string,
		channelId: string,
		cmd: string,
		lineupItemId: string
	): Promise<StreamResult> {
		// Check cache first
		const cached = this.urlCache.get(accountId, channelId);
		if (cached) {
			this.cacheHits++;
			return {
				url: cached.url,
				type: cached.type,
				accountId,
				channelId,
				lineupItemId,
				fromCache: true
			};
		}

		this.cacheMisses++;

		// Get authenticated client
		const client = await this.clientPool.getClient(accountId);

		try {
			// Resolve stream URL
			const result = await client.createLink(cmd);

			// Cache the result
			this.urlCache.set(accountId, channelId, result.url, result.type, result.expiresAt);

			logger.debug('[StalkerStreamService] Stream resolved', {
				lineupItemId,
				accountId,
				channelId,
				type: result.type,
				fromCache: false
			});

			return {
				url: result.url,
				type: result.type,
				accountId,
				channelId,
				lineupItemId,
				fromCache: false
			};
		} finally {
			// Always release the client back to the pool
			this.clientPool.release(accountId);
		}
	}

	/**
	 * Check if an error is auth-related
	 */
	private isAuthError(error: unknown): boolean {
		if (error instanceof Error) {
			const msg = error.message.toLowerCase();
			return (
				msg.includes('token') ||
				msg.includes('auth') ||
				msg.includes('unauthorized') ||
				msg.includes('forbidden') ||
				msg.includes('403') ||
				msg.includes('401')
			);
		}
		return false;
	}

	/**
	 * Create a typed stream error
	 */
	private createError(
		code: StreamErrorCode,
		message: string,
		accountId?: string,
		channelId?: string,
		attempts?: number
	): StreamError & Error {
		const error = new Error(message) as StreamError & Error;
		error.code = code;
		error.accountId = accountId;
		error.channelId = channelId;
		error.attempts = attempts;
		return error;
	}

	/**
	 * Invalidate cached URL for a specific channel
	 */
	invalidateChannel(accountId: string, channelId: string): void {
		this.urlCache.invalidate(accountId, channelId);
	}

	/**
	 * Invalidate all cached URLs for an account
	 */
	invalidateAccount(accountId: string): void {
		this.urlCache.invalidateAccount(accountId);
		this.clientPool.invalidate(accountId);
	}

	/**
	 * Get service metrics
	 */
	getMetrics(): {
		totalResolutions: number;
		cacheHits: number;
		cacheMisses: number;
		cacheHitRate: number;
		failovers: number;
		cacheStats: { size: number; hits: number; misses: number; hitRate: number };
		poolStats: {
			pooledClients: number;
			totalInUse: number;
			accounts: Array<{ accountId: string; inUse: number; lastAuthAt: number }>;
		};
	} {
		const total = this.cacheHits + this.cacheMisses;
		return {
			totalResolutions: this.totalResolutions,
			cacheHits: this.cacheHits,
			cacheMisses: this.cacheMisses,
			cacheHitRate: total > 0 ? this.cacheHits / total : 0,
			failovers: this.failovers,
			cacheStats: this.urlCache.getStats(),
			poolStats: this.clientPool.getStats()
		};
	}

	/**
	 * Shutdown service - cleanup resources
	 */
	shutdown(): void {
		this.urlCache.stop();
		this.clientPool.invalidateAll();
		logger.info('[StalkerStreamService] Service shutdown');
	}
}

// Singleton instance
let streamServiceInstance: StalkerStreamService | null = null;

/**
 * Get the singleton StalkerStreamService instance
 */
export function getStalkerStreamService(): StalkerStreamService {
	if (!streamServiceInstance) {
		streamServiceInstance = new StalkerStreamService();
	}
	return streamServiceInstance;
}
