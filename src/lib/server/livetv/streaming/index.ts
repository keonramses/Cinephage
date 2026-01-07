/**
 * Live TV Streaming Module
 *
 * Provides stream URL resolution and proxying for Live TV channels.
 */

// Types
export type {
	StreamType,
	CreateLinkResult,
	CachedStreamUrl,
	StreamResult,
	StreamErrorCode,
	StreamError,
	PooledClient,
	StreamSource,
	StreamUrlCacheConfig,
	ClientPoolConfig,
	StreamMetrics
} from './types';

// Constants
export {
	LIVETV_STREAM_URL_TTL_MS,
	LIVETV_HLS_URL_TTL_MS,
	LIVETV_DIRECT_URL_TTL_MS,
	LIVETV_CACHE_MAX_ENTRIES,
	LIVETV_CACHE_CLEANUP_INTERVAL_MS,
	LIVETV_CLIENT_MAX_AUTH_RETRIES,
	LIVETV_CLIENT_AUTH_RETRY_DELAY_MS,
	LIVETV_CLIENT_TOKEN_REFRESH_MS,
	LIVETV_STREAM_REQUEST_TIMEOUT_MS,
	LIVETV_MANIFEST_FETCH_TIMEOUT_MS,
	LIVETV_SEGMENT_FETCH_TIMEOUT_MS,
	LIVETV_SEGMENT_MAX_SIZE,
	LIVETV_SEGMENT_CACHE_MAX_AGE,
	LIVETV_MANIFEST_CACHE_MAX_AGE,
	LIVETV_MAX_RETRIES,
	LIVETV_RETRY_BASE_DELAY_MS,
	LIVETV_STB_USER_AGENT,
	LIVETV_PROXY_USER_AGENT,
	HLS_URL_PATTERNS,
	DIRECT_URL_PATTERNS
} from './constants';

// Stream client
export { StalkerStreamClient, createStalkerStreamClient } from './StalkerStreamClient';

// URL cache
export { StreamUrlCache, getStreamUrlCache } from './StreamUrlCache';

// Client pool
export { StalkerClientPool, getStalkerClientPool } from './StalkerClientPool';

// Stream service
export { StalkerStreamService, getStalkerStreamService } from './StalkerStreamService';
