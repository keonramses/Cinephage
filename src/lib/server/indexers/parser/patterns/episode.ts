/**
 * Episode Pattern Matching
 *
 * Extracts TV episode information from release titles:
 * - Season/Episode numbers (S01E05, 1x05)
 * - Season packs (Season 1, S01)
 * - Complete series
 * - Anime absolute numbering
 * - Daily shows (2024.01.15)
 */

import type { EpisodeInfo } from '../types.js';

interface EpisodeMatch {
	info: EpisodeInfo;
	matchedText: string;
	index: number;
}

/**
 * Create a default (non-TV) episode info
 */
function createDefaultEpisodeInfo(): EpisodeInfo {
	return {
		isSeasonPack: false,
		isCompleteSeries: false,
		isDaily: false
	};
}

/**
 * Episode patterns ordered by specificity (most specific first)
 */
const EPISODE_PATTERNS: Array<{
	pattern: RegExp;
	extract: (match: RegExpMatchArray) => Partial<EpisodeInfo>;
}> = [
	// Multi-season pack patterns: S01-S05, Season 1-5, S01-05, Seasons 1-5
	// These must come BEFORE generic "complete series" text patterns
	{
		pattern: /\bS(\d{1,2})[\s._-]?-[\s._-]?S?(\d{1,2})\b(?![\s._-]?E)/i,
		extract: (match) => {
			const startSeason = parseInt(match[1], 10);
			const endSeason = parseInt(match[2], 10);
			if (endSeason > startSeason && endSeason - startSeason < 20) {
				const seasons: number[] = [];
				for (let s = startSeason; s <= endSeason; s++) {
					seasons.push(s);
				}
				return { seasons, isSeasonPack: true, isCompleteSeries: startSeason === 1 };
			}
			return { seasons: [startSeason, endSeason], isSeasonPack: true };
		}
	},
	{
		pattern: /\bSeasons?[\s._-]?(\d{1,2})[\s._-]?-[\s._-]?(\d{1,2})\b/i,
		extract: (match) => {
			const startSeason = parseInt(match[1], 10);
			const endSeason = parseInt(match[2], 10);
			if (endSeason > startSeason && endSeason - startSeason < 20) {
				const seasons: number[] = [];
				for (let s = startSeason; s <= endSeason; s++) {
					seasons.push(s);
				}
				return { seasons, isSeasonPack: true, isCompleteSeries: startSeason === 1 };
			}
			return { seasons: [startSeason, endSeason], isSeasonPack: true };
		}
	},

	// Generic complete series patterns (without season range)
	{
		pattern: /\bcomplete[\s._-]?series\b/i,
		extract: () => ({ isCompleteSeries: true, isSeasonPack: true })
	},
	{
		pattern: /\bfull[\s._-]?series\b/i,
		extract: () => ({ isCompleteSeries: true, isSeasonPack: true })
	},
	{
		pattern: /\ball[\s._-]?seasons?\b/i,
		extract: () => ({ isCompleteSeries: true, isSeasonPack: true })
	},

	// Standard S##E## format (most common, handles multi-episode)
	// S01E05, S01E05E06, S01E05-E08, S01E05-08
	{
		pattern:
			/\bS(\d{1,2})[\s._-]?E(\d{1,3})(?:[\s._-]?E(\d{1,3}))?(?:[\s._-]?E(\d{1,3}))?(?=[\s._-]|$)/i,
		extract: (match) => {
			const season = parseInt(match[1], 10);
			const episodes: number[] = [parseInt(match[2], 10)];

			// Handle multi-episode patterns (only if explicitly marked with E)
			if (match[3]) {
				const ep2 = parseInt(match[3], 10);
				if (ep2 > episodes[0] && ep2 < episodes[0] + 20) {
					// Reasonable range, fill in
					for (let i = episodes[0] + 1; i <= ep2; i++) {
						episodes.push(i);
					}
				} else {
					episodes.push(ep2);
				}
			}
			if (match[4]) {
				episodes.push(parseInt(match[4], 10));
			}

			return { season, episodes, isSeasonPack: false };
		}
	},

	// Alternate format: 1x05, 01x05
	{
		pattern: /\b(\d{1,2})x(\d{1,3})(?=[\s._-]|$)/i,
		extract: (match) => {
			const season = parseInt(match[1], 10);
			const episodes: number[] = [parseInt(match[2], 10)];
			return { season, episodes, isSeasonPack: false };
		}
	},

	// Season pack patterns
	{
		pattern: /\bSeason[\s._-]?(\d{1,2})\b(?![\s._-]?E)/i,
		extract: (match) => ({
			season: parseInt(match[1], 10),
			isSeasonPack: true
		})
	},
	{
		pattern: /\bS(\d{1,2})\b(?![\s._-]?E)/i,
		extract: (match) => ({
			season: parseInt(match[1], 10),
			isSeasonPack: true
		})
	},

	// Daily show format: 2024.01.15, 2024-01-15
	// Must have valid month (01-12) and day (01-31) to avoid matching year+resolution
	{
		pattern: /\b(20\d{2})[\s._-](0[1-9]|1[0-2])[\s._-](0[1-9]|[12]\d|3[01])\b/,
		extract: (match) => ({
			isDaily: true,
			airDate: `${match[1]}-${match[2]}-${match[3]}`
		})
	},

	// Anime absolute numbering patterns
	// [045] - number in square brackets (NOT resolution like [1080p])
	{
		pattern: /\[(\d{2,4})\](?!\s*p)/i,
		extract: (match) => ({
			absoluteEpisode: parseInt(match[1], 10)
		})
	},
	// - 045 - anime style with dashes around number
	{
		pattern: /\s-\s(\d{2,4})(?=\s|$)/,
		extract: (match) => ({
			absoluteEpisode: parseInt(match[1], 10)
		})
	},
	// EP045, E045 explicit episode marker
	{
		pattern: /[\s._-]E[Pp]?(\d{2,4})(?:[\s._-]|$)/,
		extract: (match) => ({
			absoluteEpisode: parseInt(match[1], 10)
		})
	},
	{
		pattern: /\bEpisode[\s._-]?(\d{1,4})\b/i,
		extract: (match) => ({
			absoluteEpisode: parseInt(match[1], 10)
		})
	}
];

/**
 * Extract episode information from a release title
 *
 * @param title - The release title to parse
 * @returns Episode match info or null if not a TV release
 */
export function extractEpisode(title: string): EpisodeMatch | null {
	for (const { pattern, extract } of EPISODE_PATTERNS) {
		const match = title.match(pattern);
		if (match) {
			const extracted = extract(match);
			const info: EpisodeInfo = {
				...createDefaultEpisodeInfo(),
				...extracted
			};
			return {
				info,
				matchedText: match[0],
				index: match.index ?? 0
			};
		}
	}
	return null;
}

/**
 * Check if a release title appears to be a TV show
 */
export function isTvRelease(title: string): boolean {
	return EPISODE_PATTERNS.some(({ pattern }) => pattern.test(title));
}

/**
 * Extract the title portion before episode info
 * This helps isolate the show name from episode identifiers
 *
 * @param title - Full release title
 * @returns Title portion before any episode markers
 */
export function extractTitleBeforeEpisode(title: string): string {
	// Find earliest match index
	let earliestIndex = title.length;

	for (const { pattern } of EPISODE_PATTERNS) {
		const match = title.match(pattern);
		if (match && match.index !== undefined && match.index < earliestIndex) {
			earliestIndex = match.index;
		}
	}

	return title.slice(0, earliestIndex).trim();
}
