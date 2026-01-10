/**
 * Usenet Streaming Module
 *
 * Clean architecture for streaming content from Usenet/NNTP.
 *
 * Key features:
 * - Accurate byte-to-segment mapping (updates as segments decode)
 * - Adaptive prefetch based on access patterns
 * - Connection health tracking with exponential backoff
 * - Backpressure-aware streaming
 * - Request deduplication
 * - LRU cache for decoded segments
 *
 * Note: RAR streaming is NOT supported. Only direct media files can be streamed.
 */

// Main service
export {
	getUsenetStreamService,
	resetUsenetStreamService,
	type StreamabilityResult
} from './UsenetStreamService';

// NNTP management
export { getNntpManager, resetNntpManager, ArticleNotFoundError } from './NntpManager';
export { NntpPool } from './NntpPool';
export { NntpConnection } from './NntpConnection';

// Stream components
export { UsenetSeekableStream, type UsenetSeekableStreamOptions } from './UsenetSeekableStream';
export { SegmentStore, type SegmentLocation } from './SegmentStore';
export { AdaptivePrefetcher } from './AdaptivePrefetcher';

// Parsers and decoders
export { parseNzb, isRarOnlyNzb, getBestStreamableFile } from './NzbParser';
export { decodeYenc, extractYencHeader } from './YencDecoder';

// Types
export {
	type NntpServerConfig,
	type NntpConnectionState,
	type NntpResponse,
	type YencHeader,
	type YencTrailer,
	type YencDecodeResult,
	type NzbSegment,
	type NzbFile,
	type ParsedNzb,
	type ByteRange,
	type ProviderHealth,
	type SegmentDecodeInfo,
	type AccessPattern,
	type PrefetchStrategy,
	type CreateStreamResult,
	type ErrorType,
	type ClassifiedError,
	NntpResponseCode,
	// Utility functions
	isMediaFile,
	isVideoFile,
	isRarFile,
	getContentType,
	parseRangeHeader,
	// Constants
	VIDEO_EXTENSIONS,
	AUDIO_EXTENSIONS,
	MEDIA_EXTENSIONS,
	RAR_PATTERNS,
	CONTENT_TYPE_MAP
} from './types';
