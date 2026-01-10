/**
 * Extraction module exports.
 *
 * NOTE: RAR/archive extraction functionality has been removed.
 * Only the cache manager remains for cleanup of any existing extracted files.
 */

export {
	getExtractionCacheManager,
	type CacheSettings,
	type CacheStats
} from './ExtractionCacheManager';
