/**
 * Stream URL Cache
 *
 * Manages cached stream URLs with expiration tracking for Live TV streaming.
 * Automatically refreshes URLs when they expire (based on Stalkerhek pattern).
 *
 * Key Design:
 * - HLS streams: 30 second expiration
 * - Direct streams: 5 second expiration
 * - Thread-safe with per-lineup locking
 * - Integrates with LiveTvStreamService for URL resolution
 */

import { getLiveTvStreamService } from './LiveTvStreamService.js';
import type { FetchStreamResult } from '$lib/types/livetv';
import { logger } from '$lib/logging';

// Expiration timeouts (in milliseconds) - matching Stalkerhek behavior
const HLS_STREAM_TIMEOUT_MS = 30_000; // 30 seconds for HLS streams
const DIRECT_STREAM_TIMEOUT_MS = 5_000; // 5 seconds for direct streams

/**
 * Cached stream entry with metadata
 */
interface CachedStream {
	url: string;
	type: 'hls' | 'direct' | 'unknown';
	providerHeaders: Record<string, string>;
	accountId: string;
	channelId: string;
	providerType: string;
	createdAt: number;
	lineupItemId: string;
}

/**
 * Stream URL Cache
 *
 * Singleton service that manages stream URL lifecycle:
 * 1. Caches resolved stream URLs with timestamps
 * 2. Validates URLs before use (checks expiration)
 * 3. Refreshes expired URLs automatically
 * 4. Thread-safe per-lineup locking
 */
class StreamUrlCache {
	private cache: Map<string, CachedStream> = new Map();
	private locks: Map<string, Promise<void>> = new Map();

	/**
	 * Get or create a cached stream for a lineup item
	 * Returns existing valid stream or resolves a fresh one
	 */
	async getStream(lineupItemId: string): Promise<FetchStreamResult> {
		// Try to use cached stream first
		const cached = this.cache.get(lineupItemId);
		if (cached && this.isValid(cached)) {
			logger.debug('[StreamUrlCache] Using cached stream', {
				lineupItemId,
				url: cached.url.substring(0, 50),
				age: Date.now() - cached.createdAt
			});
			return this.createResultFromCache(cached);
		}

		// Need to resolve fresh URL - use lock to prevent concurrent resolutions
		return this.resolveWithLock(lineupItemId);
	}

	/**
	 * Force refresh a stream URL (useful when current URL is known to be stale)
	 */
	async refreshStream(lineupItemId: string): Promise<FetchStreamResult> {
		// Clear the cache entry to force fresh resolution
		this.cache.delete(lineupItemId);
		return this.resolveWithLock(lineupItemId);
	}

	/**
	 * Check if a cached stream is still valid based on age
	 */
	isValid(cached: CachedStream): boolean {
		const age = Date.now() - cached.createdAt;
		const maxAge = cached.type === 'hls' ? HLS_STREAM_TIMEOUT_MS : DIRECT_STREAM_TIMEOUT_MS;
		return age < maxAge;
	}

	/**
	 * Get cache entry without validation (for checking existence)
	 */
	getCached(lineupItemId: string): CachedStream | undefined {
		return this.cache.get(lineupItemId);
	}

	/**
	 * Invalidate a cached stream (e.g., on error)
	 */
	invalidate(lineupItemId: string): void {
		this.cache.delete(lineupItemId);
		logger.debug('[StreamUrlCache] Invalidated cache entry', { lineupItemId });
	}

	/**
	 * Clear all cached entries
	 */
	clear(): void {
		this.cache.clear();
		this.locks.clear();
		logger.info('[StreamUrlCache] Cache cleared');
	}

	/**
	 * Resolve stream with locking to prevent concurrent requests for same lineup
	 */
	private async resolveWithLock(lineupItemId: string): Promise<FetchStreamResult> {
		// Wait for any existing lock
		const existingLock = this.locks.get(lineupItemId);
		if (existingLock) {
			logger.debug('[StreamUrlCache] Waiting for existing resolution', { lineupItemId });
			await existingLock;
			// After waiting, check cache again (another request may have resolved it)
			const cached = this.cache.get(lineupItemId);
			if (cached && this.isValid(cached)) {
				return this.createResultFromCache(cached);
			}
		}

		// Create new lock
		let releaseLock: () => void;
		const lockPromise = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		this.locks.set(lineupItemId, lockPromise);

		try {
			// Double-check cache after acquiring lock
			const cached = this.cache.get(lineupItemId);
			if (cached && this.isValid(cached)) {
				return this.createResultFromCache(cached);
			}

			// Resolve fresh stream
			logger.info('[StreamUrlCache] Resolving fresh stream URL', { lineupItemId });
			const streamService = getLiveTvStreamService();
			const result = await streamService.fetchStream(lineupItemId);

			// Cache the result
			this.cache.set(lineupItemId, {
				url: result.url,
				type: result.type,
				providerHeaders: result.providerHeaders || {},
				accountId: result.accountId,
				channelId: result.channelId,
				providerType: result.providerType,
				createdAt: Date.now(),
				lineupItemId
			});

			logger.info('[StreamUrlCache] Stream resolved and cached', {
				lineupItemId,
				url: result.url.substring(0, 50),
				type: result.type
			});

			return result;
		} finally {
			// Release lock
			this.locks.delete(lineupItemId);
			releaseLock!();
		}
	}

	/**
	 * Create FetchStreamResult from cache entry
	 */
	private createResultFromCache(cached: CachedStream): FetchStreamResult {
		// Note: We return a result without the actual Response object
		// The caller will need to fetch the actual content using the URL
		return {
			response: null as unknown as Response, // Will be fetched by caller
			url: cached.url,
			type: cached.type,
			accountId: cached.accountId,
			channelId: cached.channelId,
			lineupItemId: cached.lineupItemId,
			providerType: cached.providerType as 'stalker' | 'xstream' | 'm3u' | 'iptvorg',
			providerHeaders: cached.providerHeaders
		};
	}
}

// Singleton instance
let cacheInstance: StreamUrlCache | null = null;

export function getStreamUrlCache(): StreamUrlCache {
	if (!cacheInstance) {
		cacheInstance = new StreamUrlCache();
	}
	return cacheInstance;
}

// Export for testing
export { StreamUrlCache, HLS_STREAM_TIMEOUT_MS, DIRECT_STREAM_TIMEOUT_MS };
