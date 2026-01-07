/**
 * Stream URL Cache
 *
 * TTL-based cache for resolved stream URLs with account-aware management.
 * Reduces portal API calls by caching recently resolved stream URLs.
 */

import { logger } from '$lib/logging';
import type { CachedStreamUrl, StreamType, StreamUrlCacheConfig } from './types';
import {
	LIVETV_STREAM_URL_TTL_MS,
	LIVETV_HLS_URL_TTL_MS,
	LIVETV_DIRECT_URL_TTL_MS,
	LIVETV_CACHE_MAX_ENTRIES,
	LIVETV_CACHE_CLEANUP_INTERVAL_MS
} from './constants';

const defaultConfig: StreamUrlCacheConfig = {
	defaultTtlMs: LIVETV_STREAM_URL_TTL_MS,
	hlsTtlMs: LIVETV_HLS_URL_TTL_MS,
	directTtlMs: LIVETV_DIRECT_URL_TTL_MS,
	maxEntries: LIVETV_CACHE_MAX_ENTRIES,
	cleanupIntervalMs: LIVETV_CACHE_CLEANUP_INTERVAL_MS
};

export class StreamUrlCache {
	private cache = new Map<string, CachedStreamUrl>();
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;
	private config: StreamUrlCacheConfig;

	// Metrics
	private hits = 0;
	private misses = 0;

	constructor(config: Partial<StreamUrlCacheConfig> = {}) {
		this.config = { ...defaultConfig, ...config };
		this.startCleanupTimer();
	}

	/**
	 * Generate cache key from account and channel IDs
	 */
	private static cacheKey(accountId: string, channelId: string): string {
		return `${accountId}:${channelId}`;
	}

	/**
	 * Get a cached stream URL if it exists and is not expired
	 */
	get(accountId: string, channelId: string): CachedStreamUrl | null {
		const key = StreamUrlCache.cacheKey(accountId, channelId);
		const entry = this.cache.get(key);

		if (!entry) {
			this.misses++;
			return null;
		}

		// Check expiration
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			this.misses++;
			logger.debug('[StreamUrlCache] Entry expired', { accountId, channelId });
			return null;
		}

		// Update usage stats
		entry.useCount++;
		entry.lastUsed = Date.now();
		this.hits++;

		logger.debug('[StreamUrlCache] Cache hit', {
			accountId,
			channelId,
			useCount: entry.useCount
		});

		return entry;
	}

	/**
	 * Store a stream URL in the cache
	 */
	set(
		accountId: string,
		channelId: string,
		url: string,
		type: StreamType,
		expiresAt?: number
	): void {
		this.evictIfNeeded();

		const key = StreamUrlCache.cacheKey(accountId, channelId);
		const now = Date.now();

		// Calculate TTL based on stream type
		const ttl = this.getTtlForType(type);
		const actualExpiresAt = expiresAt ? Math.min(expiresAt, now + ttl) : now + ttl;

		const entry: CachedStreamUrl = {
			url,
			type,
			accountId,
			channelId,
			resolvedAt: now,
			expiresAt: actualExpiresAt,
			useCount: 1,
			lastUsed: now
		};

		this.cache.set(key, entry);

		logger.debug('[StreamUrlCache] Entry cached', {
			accountId,
			channelId,
			type,
			ttlMinutes: Math.round(ttl / 1000 / 60)
		});
	}

	/**
	 * Get TTL based on stream type
	 */
	private getTtlForType(type: StreamType): number {
		switch (type) {
			case 'hls':
				return this.config.hlsTtlMs;
			case 'direct':
				return this.config.directTtlMs;
			default:
				return this.config.defaultTtlMs;
		}
	}

	/**
	 * Invalidate a specific entry
	 */
	invalidate(accountId: string, channelId: string): boolean {
		const key = StreamUrlCache.cacheKey(accountId, channelId);
		const deleted = this.cache.delete(key);
		if (deleted) {
			logger.debug('[StreamUrlCache] Entry invalidated', { accountId, channelId });
		}
		return deleted;
	}

	/**
	 * Invalidate all URLs for an account (e.g., on re-auth)
	 */
	invalidateAccount(accountId: string): number {
		let count = 0;
		for (const [key, entry] of this.cache) {
			if (entry.accountId === accountId) {
				this.cache.delete(key);
				count++;
			}
		}
		if (count > 0) {
			logger.info('[StreamUrlCache] Account entries invalidated', { accountId, count });
		}
		return count;
	}

	/**
	 * Clear the entire cache
	 */
	clear(): void {
		const size = this.cache.size;
		this.cache.clear();
		logger.info('[StreamUrlCache] Cache cleared', { entries: size });
	}

	/**
	 * Evict expired entries and oldest entries if over limit
	 */
	private evictIfNeeded(): void {
		const now = Date.now();

		// First, remove expired entries
		for (const [key, entry] of this.cache) {
			if (now > entry.expiresAt) {
				this.cache.delete(key);
			}
		}

		// If still over limit, remove least recently used
		if (this.cache.size >= this.config.maxEntries) {
			const entries = Array.from(this.cache.entries()).sort(
				(a, b) => a[1].lastUsed - b[1].lastUsed
			);

			// Remove oldest 10%
			const toRemove = Math.ceil(this.config.maxEntries * 0.1);
			for (let i = 0; i < toRemove && i < entries.length; i++) {
				this.cache.delete(entries[i][0]);
			}

			logger.debug('[StreamUrlCache] Evicted LRU entries', { count: toRemove });
		}
	}

	/**
	 * Start periodic cleanup timer
	 */
	private startCleanupTimer(): void {
		if (this.cleanupTimer) return;

		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, this.config.cleanupIntervalMs);

		// Prevent timer from blocking process exit
		if (this.cleanupTimer.unref) {
			this.cleanupTimer.unref();
		}
	}

	/**
	 * Cleanup expired entries
	 */
	private cleanup(): void {
		const now = Date.now();
		let expired = 0;

		for (const [key, entry] of this.cache) {
			if (now > entry.expiresAt) {
				this.cache.delete(key);
				expired++;
			}
		}

		if (expired > 0) {
			logger.debug('[StreamUrlCache] Cleanup removed expired entries', { count: expired });
		}
	}

	/**
	 * Stop the cleanup timer
	 */
	stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { size: number; hits: number; misses: number; hitRate: number } {
		const total = this.hits + this.misses;
		return {
			size: this.cache.size,
			hits: this.hits,
			misses: this.misses,
			hitRate: total > 0 ? this.hits / total : 0
		};
	}
}

// Singleton instance
let streamUrlCacheInstance: StreamUrlCache | null = null;

/**
 * Get the singleton StreamUrlCache instance
 */
export function getStreamUrlCache(): StreamUrlCache {
	if (!streamUrlCacheInstance) {
		streamUrlCacheInstance = new StreamUrlCache();
	}
	return streamUrlCacheInstance;
}
