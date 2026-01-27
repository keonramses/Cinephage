/**
 * External ID Resolver
 *
 * Resolves external IDs (IMDB, title+year) to TMDB IDs
 * Uses TMDB's find API and search APIs
 */

import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging';

export interface IdResolutionResult {
	/** Resolved TMDB ID */
	tmdbId: number | null;

	/** Title from TMDB (for display) */
	title?: string;

	/** Year from TMDB */
	year?: number;

	/** Poster path from TMDB */
	posterPath?: string | null;

	/** Whether resolution was successful */
	success: boolean;

	/** Error message if resolution failed */
	error?: string;
}

export class ExternalIdResolver {
	/**
	 * Resolve an IMDB ID to a TMDB ID
	 */
	async resolveByImdbId(imdbId: string, mediaType: 'movie' | 'tv'): Promise<IdResolutionResult> {
		logger.info('[ExternalIdResolver] Resolving IMDB ID', { imdbId, mediaType });

		try {
			const result = await tmdb.findByExternalId(imdbId, 'imdb_id');

			// Check for movie results
			if (mediaType === 'movie' && result.movie_results.length > 0) {
				const movie = result.movie_results[0];
				logger.info('[ExternalIdResolver] Resolved IMDB to TMDB (movie)', {
					imdbId,
					tmdbId: movie.id,
					title: movie.title
				});
				return {
					tmdbId: movie.id,
					title: movie.title,
					year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : undefined,
					posterPath: movie.poster_path,
					success: true
				};
			}

			// Check for TV results
			if (mediaType === 'tv' && result.tv_results.length > 0) {
				const show = result.tv_results[0];
				logger.info('[ExternalIdResolver] Resolved IMDB to TMDB (TV)', {
					imdbId,
					tmdbId: show.id,
					title: show.name
				});
				return {
					tmdbId: show.id,
					title: show.name,
					year: show.first_air_date ? parseInt(show.first_air_date.substring(0, 4)) : undefined,
					posterPath: show.poster_path,
					success: true
				};
			}

			// Try cross-type lookup (IMDB might be for wrong type)
			if (result.movie_results.length > 0) {
				const movie = result.movie_results[0];
				logger.warn('[ExternalIdResolver] IMDB resolved to movie but requested TV', {
					imdbId,
					foundTitle: movie.title
				});
				// Still return it - better than nothing
				return {
					tmdbId: movie.id,
					title: movie.title,
					year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : undefined,
					posterPath: movie.poster_path,
					success: true
				};
			}

			if (result.tv_results.length > 0) {
				const show = result.tv_results[0];
				logger.warn('[ExternalIdResolver] IMDB resolved to TV but requested movie', {
					imdbId,
					foundTitle: show.name
				});
				return {
					tmdbId: show.id,
					title: show.name,
					year: show.first_air_date ? parseInt(show.first_air_date.substring(0, 4)) : undefined,
					posterPath: show.poster_path,
					success: true
				};
			}

			logger.warn('[ExternalIdResolver] IMDB ID not found in TMDB', { imdbId });
			return {
				tmdbId: null,
				success: false,
				error: 'IMDB ID not found in TMDB'
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('[ExternalIdResolver] Failed to resolve IMDB ID', {
				imdbId,
				error: errorMessage
			});
			return {
				tmdbId: null,
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Resolve by title and optional year
	 */
	async resolveByTitle(
		title: string,
		year: number | undefined,
		mediaType: 'movie' | 'tv'
	): Promise<IdResolutionResult> {
		logger.info('[ExternalIdResolver] Resolving by title', { title, year, mediaType });

		try {
			let searchResult;

			if (mediaType === 'movie') {
				searchResult = await tmdb.searchMovies(title, year, true); // skipFilters=true for accurate search
			} else {
				searchResult = await tmdb.searchTv(title, year, true);
			}

			if (searchResult.results.length === 0) {
				logger.warn('[ExternalIdResolver] No TMDB results for title', { title, year });
				return {
					tmdbId: null,
					success: false,
					error: 'No TMDB results found'
				};
			}

			// Take the first result
			const result = searchResult.results[0];
			const resultTitle = mediaType === 'movie' ? result.title : result.name;

			logger.info('[ExternalIdResolver] Resolved title to TMDB', {
				title,
				foundTitle: resultTitle,
				tmdbId: result.id
			});

			return {
				tmdbId: result.id,
				title: resultTitle,
				year:
					mediaType === 'movie'
						? result.release_date
							? parseInt(result.release_date.substring(0, 4))
							: undefined
						: result.first_air_date
							? parseInt(result.first_air_date.substring(0, 4))
							: undefined,
				posterPath: result.poster_path,
				success: true
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('[ExternalIdResolver] Failed to resolve title', {
				title,
				year,
				error: errorMessage
			});
			return {
				tmdbId: null,
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Resolve an external list item to a full TMDB item
	 * Tries multiple strategies in order:
	 * 1. Use existing TMDB ID if available
	 * 2. Resolve IMDB ID to TMDB ID
	 * 3. Search by title+year
	 */
	async resolveItem(
		item: {
			tmdbId?: number;
			imdbId?: string;
			title: string;
			year?: number;
		},
		mediaType: 'movie' | 'tv'
	): Promise<IdResolutionResult> {
		// Strategy 1: Already have TMDB ID
		if (item.tmdbId) {
			logger.debug('[ExternalIdResolver] Item already has TMDB ID', {
				tmdbId: item.tmdbId,
				title: item.title
			});

			// Optionally fetch full details to get poster, etc.
			try {
				if (mediaType === 'movie') {
					const details = await tmdb.getMovie(item.tmdbId);
					return {
						tmdbId: item.tmdbId,
						title: details.title,
						year: details.release_date ? parseInt(details.release_date.substring(0, 4)) : undefined,
						posterPath: details.poster_path,
						success: true
					};
				} else {
					const details = await tmdb.getTVShow(item.tmdbId);
					return {
						tmdbId: item.tmdbId,
						title: details.name,
						year: details.first_air_date
							? parseInt(details.first_air_date.substring(0, 4))
							: undefined,
						posterPath: details.poster_path,
						success: true
					};
				}
			} catch (error) {
				// TMDB ID might be invalid, continue to other strategies
				logger.warn(
					'[ExternalIdResolver] Failed to fetch details for TMDB ID, trying other methods',
					{
						tmdbId: item.tmdbId,
						error: error instanceof Error ? error.message : String(error)
					}
				);
			}
		}

		// Strategy 2: Resolve IMDB ID
		if (item.imdbId) {
			const result = await this.resolveByImdbId(item.imdbId, mediaType);
			if (result.success) {
				return result;
			}
			// IMDB resolution failed, continue to title search
		}

		// Strategy 3: Search by title+year
		return await this.resolveByTitle(item.title, item.year, mediaType);
	}
}

// Singleton instance
export const externalIdResolver = new ExternalIdResolver();
