/**
 * YFlix Content ID Lookup Provider
 *
 * Uses the enc-dec.app YFlix database API for lookups.
 *
 * Benefits:
 * 1. Direct TMDB ID -> YFlix ID mapping (no title matching needed)
 * 2. Returns episode IDs, which can skip an API call later
 * 3. More reliable than HTML scraping
 */

import { logger } from '$lib/logging';
import { getEncDecClient } from '../../enc-dec';
import type {
	IContentIdLookupProvider,
	LookupMediaType,
	LookupParams,
	LookupProviderId,
	LookupResult
} from '../types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * YFlix content ID lookup via enc-dec.app database
 */
export class YFlixLookup implements IContentIdLookupProvider {
	readonly providerId: LookupProviderId = 'yflix';
	readonly name = 'YFlix';

	private encDec = getEncDecClient();

	/**
	 * YFlix supports both movies and TV shows
	 */
	supportsMediaType(type: LookupMediaType): boolean {
		return type === 'movie' || type === 'tv';
	}

	/**
	 * Look up YFlix content ID via database API
	 */
	async lookup(params: LookupParams): Promise<LookupResult> {
		const startTime = Date.now();

		try {
			const type = params.type === 'movie' ? 'movie' : 'tv';

			// Look up by TMDB ID
			const dbItem = await this.encDec.findYFlixById({
				tmdb_id: params.tmdbId,
				type
			});

			if (!dbItem) {
				return {
					success: false,
					contentId: null,
					error: 'Not found in YFlix database',
					cached: false,
					durationMs: Date.now() - startTime
				};
			}

			// Get episode ID from database
			// For movies: always at episodes["1"]["1"].eid
			// For TV: at episodes[season][episode].eid
			let episodeId: string | undefined;
			if (params.type === 'movie') {
				// Movies store their episode ID at season 1, episode 1
				episodeId = dbItem.episodes['1']?.['1']?.eid;
			} else if (params.type === 'tv' && params.season && params.episode) {
				const season = params.season.toString();
				const episode = params.episode.toString();
				episodeId = dbItem.episodes[season]?.[episode]?.eid;

				if (!episodeId) {
					logger.debug('YFlix episode not found in database', {
						tmdbId: params.tmdbId,
						season,
						episode,
						availableSeasons: Object.keys(dbItem.episodes),
						...streamLog
					});
				}
			}

			logger.debug('YFlix found via database', {
				tmdbId: params.tmdbId,
				contentId: dbItem.info.flix_id,
				episodeId,
				title: dbItem.info.title_en,
				...streamLog
			});

			return {
				success: true,
				contentId: dbItem.info.flix_id,
				episodeId,
				cached: false,
				durationMs: Date.now() - startTime
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			logger.warn('YFlix lookup failed', {
				tmdbId: params.tmdbId,
				error: errorMsg,
				...streamLog
			});

			return {
				success: false,
				contentId: null,
				error: errorMsg,
				cached: false,
				durationMs: Date.now() - startTime
			};
		}
	}
}
