/**
 * Live TV Streaming Types
 *
 * Type definitions for the streaming proxy system.
 */

/**
 * Type of stream detected
 */
export type StreamType = 'hls' | 'direct' | 'unknown';

/**
 * Result of resolving a stream URL via create_link
 */
export interface CreateLinkResult {
	url: string;
	type: StreamType;
	expiresAt: number; // Timestamp when this URL is expected to expire
}

/**
 * Cached stream URL entry
 */
export interface CachedStreamUrl {
	url: string;
	type: StreamType;
	accountId: string;
	channelId: string;
	resolvedAt: number;
	expiresAt: number;
	useCount: number;
	lastUsed: number;
}

/**
 * Result of stream URL resolution
 */
export interface StreamResult {
	url: string;
	type: StreamType;
	accountId: string;
	channelId: string;
	lineupItemId: string;
	fromCache: boolean;
}

/**
 * Stream resolution error codes
 */
export type StreamErrorCode =
	| 'LINEUP_ITEM_NOT_FOUND'
	| 'ACCOUNT_NOT_FOUND'
	| 'CHANNEL_NOT_FOUND'
	| 'AUTH_FAILED'
	| 'CREATE_LINK_FAILED'
	| 'ALL_SOURCES_FAILED'
	| 'STREAM_FETCH_FAILED';

/**
 * Stream resolution error
 */
export interface StreamError {
	code: StreamErrorCode;
	message: string;
	accountId?: string;
	channelId?: string;
	attempts?: number;
}

/**
 * Pooled Stalker client instance
 */
export interface PooledClient {
	accountId: string;
	portalUrl: string;
	macAddress: string;
	token: string | null;
	lastAuthAt: number;
	authAttempts: number;
	inUse: number;
}

/**
 * Stream source for failover (primary or backup)
 */
export interface StreamSource {
	accountId: string;
	channelId: string;
	cmd: string;
	priority: number; // 0 = primary, 1+ = backups
}

/**
 * Configuration for the stream URL cache
 */
export interface StreamUrlCacheConfig {
	defaultTtlMs: number;
	hlsTtlMs: number;
	directTtlMs: number;
	maxEntries: number;
	cleanupIntervalMs: number;
}

/**
 * Configuration for the client pool
 */
export interface ClientPoolConfig {
	maxAuthRetries: number;
	authRetryDelayMs: number;
	tokenRefreshMs: number;
	requestTimeoutMs: number;
}

/**
 * Active stream metrics (for monitoring)
 */
export interface StreamMetrics {
	activeStreams: number;
	totalResolutions: number;
	cacheHits: number;
	cacheMisses: number;
	authFailures: number;
	failovers: number;
}
