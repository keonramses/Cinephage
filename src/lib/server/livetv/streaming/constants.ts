/**
 * Live TV Streaming Constants
 *
 * Configuration constants for the streaming proxy system.
 */

// Stream URL Cache TTLs
export const LIVETV_STREAM_URL_TTL_MS = 30 * 60 * 1000; // 30 minutes default
export const LIVETV_HLS_URL_TTL_MS = 60 * 60 * 1000; // 1 hour for HLS (segments have own tokens)
export const LIVETV_DIRECT_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes for direct streams

// Cache configuration
export const LIVETV_CACHE_MAX_ENTRIES = 200;
export const LIVETV_CACHE_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// Client pool configuration
export const LIVETV_CLIENT_MAX_AUTH_RETRIES = 3;
export const LIVETV_CLIENT_AUTH_RETRY_DELAY_MS = 1000; // Base delay with exponential backoff
export const LIVETV_CLIENT_TOKEN_REFRESH_MS = 60 * 60 * 1000; // Force re-auth after 1 hour

// Request timeouts
export const LIVETV_STREAM_REQUEST_TIMEOUT_MS = 15000; // 15 seconds for stream URL resolution
export const LIVETV_MANIFEST_FETCH_TIMEOUT_MS = 10000; // 10 seconds for HLS manifest fetch
export const LIVETV_SEGMENT_FETCH_TIMEOUT_MS = 30000; // 30 seconds for segment fetch

// Segment proxy configuration
export const LIVETV_SEGMENT_MAX_SIZE = 50 * 1024 * 1024; // 50MB max segment size
export const LIVETV_SEGMENT_CACHE_MAX_AGE = 3600; // 1 hour cache for segments
export const LIVETV_MANIFEST_CACHE_MAX_AGE = 0; // No caching for live manifests

// Retry configuration
export const LIVETV_MAX_RETRIES = 3;
export const LIVETV_RETRY_BASE_DELAY_MS = 100;

// User agent for Stalker portal requests (mimic STB)
export const LIVETV_STB_USER_AGENT =
	'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';

// User agent for proxied stream requests - use STB UA since streams expect it
export const LIVETV_PROXY_USER_AGENT = LIVETV_STB_USER_AGENT;

// Stream type detection patterns
export const HLS_URL_PATTERNS = ['.m3u8', '/hls/', '/playlist/', '/live.m3u8', '/index.m3u8'];
export const DIRECT_URL_PATTERNS = ['.ts', '/live/', '/stream/', '/udp/', '/rtp/'];
