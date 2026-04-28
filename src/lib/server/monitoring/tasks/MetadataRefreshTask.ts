import { db } from '$lib/server/db/index.js';
import { movies } from '$lib/server/db/schema.js';
import { isNull, eq } from 'drizzle-orm';
import { tmdb } from '$lib/server/tmdb.js';
import { logger } from '$lib/logging/index.js';
import type { TaskResult } from '../MonitoringScheduler.js';
import type { TaskExecutionContext } from '$lib/server/tasks/TaskExecutionContext.js';
import { TaskCancelledException } from '$lib/server/tasks/TaskCancelledException.js';

export async function executeMetadataRefreshTask(
	ctx: TaskExecutionContext | null
): Promise<TaskResult> {
	const executedAt = new Date();
	logger.info('[MetadataRefreshTask] Starting metadata refresh');

	let itemsProcessed = 0;
	let itemsUpdated = 0;
	let errors = 0;

	try {
		ctx?.checkCancelled();

		const staleMovies = await db
			.select({
				id: movies.id,
				tmdbId: movies.tmdbId,
				title: movies.title
			})
			.from(movies)
			.where(isNull(movies.tmdbCollectionId));

		logger.info(
			{ count: staleMovies.length },
			'[MetadataRefreshTask] Found movies with missing collection data'
		);

		for await (const movie of ctx?.iterate?.(staleMovies) ?? staleMovies) {
			try {
				const tmdbMovie = await tmdb.getMovie(movie.tmdbId);

				let externalIds: { imdb_id: string | null } | null = null;
				try {
					externalIds = await tmdb.getMovieExternalIds(movie.tmdbId);
				} catch {
					logger.warn(
						{ tmdbId: movie.tmdbId },
						'[MetadataRefreshTask] Failed to fetch external IDs (non-fatal)'
					);
				}

				await db
					.update(movies)
					.set({
						title: tmdbMovie.title,
						originalTitle: tmdbMovie.original_title,
						overview: tmdbMovie.overview,
						posterPath: tmdbMovie.poster_path,
						backdropPath: tmdbMovie.backdrop_path,
						runtime: tmdbMovie.runtime,
						genres: tmdbMovie.genres?.map((g) => g.name),
						year: tmdbMovie.release_date
							? new Date(tmdbMovie.release_date).getFullYear()
							: undefined,
						imdbId: externalIds?.imdb_id ?? undefined,
						tmdbCollectionId: tmdbMovie.belongs_to_collection?.id ?? null,
						collectionName: tmdbMovie.belongs_to_collection?.name ?? null
					})
					.where(eq(movies.id, movie.id));

				itemsUpdated++;
			} catch (err) {
				errors++;
				logger.error(
					{ err, movieId: movie.id, tmdbId: movie.tmdbId },
					'[MetadataRefreshTask] Failed to refresh movie'
				);
			}

			itemsProcessed++;

			if (itemsProcessed % 50 === 0) {
				logger.info(
					{ itemsProcessed, itemsUpdated, errors, total: staleMovies.length },
					'[MetadataRefreshTask] Progress'
				);
			}

			await ctx?.delay(250);
		}

		logger.info(
			{ itemsProcessed, itemsUpdated, errors },
			'[MetadataRefreshTask] Metadata refresh completed'
		);

		return {
			taskType: 'metadataRefresh',
			itemsProcessed,
			itemsGrabbed: itemsUpdated,
			errors,
			executedAt
		};
	} catch (error) {
		if (TaskCancelledException.isTaskCancelled(error)) {
			logger.info({ itemsProcessed }, '[MetadataRefreshTask] Task cancelled');
		} else {
			logger.error({ err: error }, '[MetadataRefreshTask] Metadata refresh failed');
		}
		throw error;
	}
}
