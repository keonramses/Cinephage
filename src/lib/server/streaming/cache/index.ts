/**
 * Cache Module Exports
 *
 * Multi-level caching for stream extraction with:
 * - Stream URL cache (successful extractions)
 * - Validation cache (stream validation results)
 * - Negative cache (failed extractions - prevents hammering)
 */

export {
	MultiLevelStreamCache,
	getStreamCache,
	createStreamCache,
	type CacheStats
} from './StreamCache';
