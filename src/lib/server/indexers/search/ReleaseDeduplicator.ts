import type { ReleaseResult, EnhancedReleaseResult } from '../types';
import { logger } from '$lib/logging';

/**
 * Result of deduplication operation.
 */
export interface DeduplicationResult {
	releases: ReleaseResult[];
	removed: number;
}

/**
 * Result of enhanced deduplication operation (post-enrichment).
 */
export interface EnhancedDeduplicationResult {
	releases: EnhancedReleaseResult[];
	removed: number;
}

/**
 * Pre-compiled regex patterns for title normalization.
 * Defined at module level to avoid recompilation per call.
 */
const QUALITY_PATTERN =
	/\b(720p|1080p|2160p|4k|uhd|hdr|hdr10|hdr10\+|dolby|dts|dts-hd|dts-x|atmos|truehd)\b/gi;
const CODEC_PATTERN = /\b(x264|x265|h264|h265|hevc|avc|xvid|divx|av1|vp9)\b/gi;
const SOURCE_PATTERN =
	/\b(bluray|blu-ray|bdrip|brrip|webrip|web-rip|webdl|web-dl|hdtv|dvdrip|hdrip|remux|dvdscr|screener|cam|ts|telesync|hdcam)\b/gi;
const BRACKET_PATTERN = /\[.*?\]/g;
const GROUP_PATTERN = /-[a-z0-9]+$/i;
const SPECIAL_CHARS_PATTERN = /[^a-z0-9\s]/g;
const WHITESPACE_PATTERN = /\s+/g;

/**
 * Maximum size for title normalization cache.
 */
const MAX_NORMALIZE_CACHE_SIZE = 5000;

/**
 * Deduplicates releases by infoHash or normalized title.
 * Uses pre-compiled regex and memoization for performance.
 */
export class ReleaseDeduplicator {
	/** Cache for normalized titles to avoid redundant regex operations */
	private normalizeCache: Map<string, string> = new Map();
	/**
	 * Deduplicates releases, preferring those with more seeders.
	 * Tracks all source indexers that returned the same release (by infoHash).
	 */
	deduplicate(releases: ReleaseResult[]): DeduplicationResult {
		const seen = new Map<string, ReleaseResult>();

		for (const release of releases) {
			const key = this.getDedupeKey(release);
			const existing = seen.get(key);

			if (!existing) {
				// First time seeing this release - initialize sourceIndexers
				const releaseWithSources = {
					...release,
					sourceIndexers: [release.indexerName]
				};
				seen.set(key, releaseWithSources);
			} else {
				// Duplicate found - track this indexer as another source
				const currentSources = existing.sourceIndexers ?? [existing.indexerName];
				if (!currentSources.includes(release.indexerName)) {
					currentSources.push(release.indexerName);
				}

				if (this.shouldPrefer(release, existing)) {
					// Prefer the new release but keep all source indexers
					const releaseWithSources = {
						...release,
						sourceIndexers: currentSources
					};
					seen.set(key, releaseWithSources);
				} else {
					// Keep existing but update its sourceIndexers
					existing.sourceIndexers = currentSources;
				}
			}
		}

		const result = Array.from(seen.values());

		// Log multi-source releases for debugging
		const multiSourceReleases = result.filter(
			(r) => r.sourceIndexers && r.sourceIndexers.length > 1
		);
		if (multiSourceReleases.length > 0) {
			logger.debug('[Deduplicator] Releases from multiple indexers', {
				count: multiSourceReleases.length,
				samples: multiSourceReleases.slice(0, 5).map((r) => ({
					title: r.title,
					sources: r.sourceIndexers
				}))
			});
		}

		return {
			releases: result,
			removed: releases.length - seen.size
		};
	}

	/**
	 * Deduplicates enhanced releases using Radarr-style preference logic.
	 * Called AFTER enrichment when we have rejection counts and scores.
	 *
	 * Preference order (like Radarr):
	 * 1. Fewer rejections wins (non-rejected preferred over rejected)
	 * 2. Higher indexer priority wins (lower priority number = higher preference)
	 * 3. Fallback to legacy logic (seeders > size > age)
	 */
	deduplicateEnhanced(releases: EnhancedReleaseResult[]): EnhancedDeduplicationResult {
		const seen = new Map<string, EnhancedReleaseResult>();

		for (const release of releases) {
			const key = this.getDedupeKey(release);
			const existing = seen.get(key);

			if (!existing) {
				// First time seeing this release - initialize sourceIndexers
				const releaseWithSources = {
					...release,
					sourceIndexers: [release.indexerName]
				};
				seen.set(key, releaseWithSources);
			} else {
				// Duplicate found - track this indexer as another source
				const currentSources = existing.sourceIndexers ?? [existing.indexerName];
				if (!currentSources.includes(release.indexerName)) {
					currentSources.push(release.indexerName);
				}

				if (this.shouldPreferEnhanced(release, existing)) {
					// Prefer the new release but keep all source indexers
					const releaseWithSources = {
						...release,
						sourceIndexers: currentSources
					};
					seen.set(key, releaseWithSources);
				} else {
					// Keep existing but update its sourceIndexers
					existing.sourceIndexers = currentSources;
				}
			}
		}

		const result = Array.from(seen.values());

		// Log deduplication stats
		const removed = releases.length - seen.size;
		if (removed > 0) {
			logger.debug('[Deduplicator] Enhanced deduplication completed', {
				input: releases.length,
				output: result.length,
				removed,
				multiSourceCount: result.filter((r) => r.sourceIndexers && r.sourceIndexers.length > 1)
					.length
			});
		}

		return {
			releases: result,
			removed
		};
	}

	/**
	 * Gets the deduplication key for a release.
	 * Priority: infoHash > streaming guid > normalized title
	 */
	private getDedupeKey(release: ReleaseResult): string {
		// Use infoHash if available (most reliable for torrents)
		if (release.infoHash) {
			return `hash:${release.infoHash.toLowerCase()}`;
		}

		// For streaming, use guid to create a separate dedup namespace
		// Streaming GUIDs are already unique per content (e.g., stream-movie-{tmdbId})
		// This prevents streaming releases from colliding with torrent/usenet releases
		if (release.protocol === 'streaming') {
			return `streaming:${release.guid}`;
		}

		// Fallback to normalized title for torrent/usenet without infoHash
		return `title:${this.normalizeTitle(release.title)}`;
	}

	/**
	 * Normalizes a title for comparison.
	 * Removes common variations, quality indicators, release groups, etc.
	 * Uses pre-compiled regex patterns and memoization for performance.
	 */
	private normalizeTitle(title: string): string {
		// Check memoization cache first
		const cached = this.normalizeCache.get(title);
		if (cached !== undefined) {
			return cached;
		}

		const normalized = title
			.toLowerCase()
			// Remove quality indicators (pre-compiled pattern)
			.replace(QUALITY_PATTERN, '')
			// Remove codec indicators (pre-compiled pattern)
			.replace(CODEC_PATTERN, '')
			// Remove source indicators (pre-compiled pattern)
			.replace(SOURCE_PATTERN, '')
			// Remove release group tags (pre-compiled patterns)
			.replace(BRACKET_PATTERN, '')
			.replace(GROUP_PATTERN, '')
			// Remove special characters (pre-compiled pattern)
			.replace(SPECIAL_CHARS_PATTERN, '')
			// Collapse whitespace (pre-compiled pattern)
			.replace(WHITESPACE_PATTERN, ' ')
			.trim();

		// LRU-style eviction: remove oldest entry if at capacity
		if (this.normalizeCache.size >= MAX_NORMALIZE_CACHE_SIZE) {
			const firstKey = this.normalizeCache.keys().next().value;
			if (firstKey !== undefined) {
				this.normalizeCache.delete(firstKey);
			}
		}

		// Cache the result
		this.normalizeCache.set(title, normalized);
		return normalized;
	}

	/**
	 * Clears the normalization cache.
	 * Useful for testing or when memory pressure is high.
	 */
	clearCache(): void {
		this.normalizeCache.clear();
	}

	/**
	 * Determines if the candidate release should be preferred over the existing one.
	 */
	private shouldPrefer(candidate: ReleaseResult, existing: ReleaseResult): boolean {
		const candidateSeeders = candidate.seeders ?? 0;
		const existingSeeders = existing.seeders ?? 0;

		// Prefer release with more seeders
		if (candidateSeeders !== existingSeeders) {
			return candidateSeeders > existingSeeders;
		}

		// If same seeders, prefer larger file (likely better quality)
		if (candidate.size !== existing.size) {
			return candidate.size > existing.size;
		}

		// If still tied, prefer newer release
		return candidate.publishDate > existing.publishDate;
	}

	/**
	 * Determines if the candidate enhanced release should be preferred over the existing one.
	 * Uses Radarr-style preference logic:
	 * 1. Fewer rejections wins (non-rejected over rejected)
	 * 2. Higher indexer priority wins (lower number = higher preference)
	 * 3. Fallback to legacy logic (seeders > size > age)
	 */
	private shouldPreferEnhanced(
		candidate: EnhancedReleaseResult,
		existing: EnhancedReleaseResult
	): boolean {
		const candidateRejections = candidate.rejectionCount ?? (candidate.rejected ? 1 : 0);
		const existingRejections = existing.rejectionCount ?? (existing.rejected ? 1 : 0);

		// 1. Prefer release with fewer rejections (non-rejected wins)
		if (candidateRejections !== existingRejections) {
			return candidateRejections < existingRejections;
		}

		// 2. Prefer higher priority indexer (lower number = higher priority)
		// Default priority is 25 if not set
		const candidatePriority = candidate.indexerPriority ?? 25;
		const existingPriority = existing.indexerPriority ?? 25;
		if (candidatePriority !== existingPriority) {
			return candidatePriority < existingPriority;
		}

		// 3. Fallback to legacy logic: seeders > size > age
		const candidateSeeders = candidate.seeders ?? 0;
		const existingSeeders = existing.seeders ?? 0;
		if (candidateSeeders !== existingSeeders) {
			return candidateSeeders > existingSeeders;
		}

		if (candidate.size !== existing.size) {
			return candidate.size > existing.size;
		}

		return candidate.publishDate > existing.publishDate;
	}
}
