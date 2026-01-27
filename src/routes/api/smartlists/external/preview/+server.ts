/**
 * External List Preview API
 * POST /api/smartlists/external/preview - Preview external list items
 * POST /api/smartlists/external/test - Test external list connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { providerRegistry } from '$lib/server/smartlists/providers/ProviderRegistry.js';
import { externalIdResolver } from '$lib/server/smartlists/ExternalIdResolver.js';
import { presetService } from '$lib/server/smartlists/presets/PresetService.js';
import { logger } from '$lib/logging';
import { z } from 'zod';
import { movies, series } from '$lib/server/db/schema.js';
import { db } from '$lib/server/db/index.js';

const previewSchema = z.object({
	url: z.string().url().optional(),
	headers: z.record(z.unknown()).optional(),
	mediaType: z.enum(['movie', 'tv']),
	presetId: z.string().optional()
});

export const POST: RequestHandler = async ({ request, url }) => {
	const isTest = url.pathname.endsWith('/test');

	try {
		const body = await request.json();
		const data = previewSchema.parse(body);

		// Resolve URL from preset if presetId is provided
		let fetchUrl = data.url;
		if (data.presetId) {
			const preset = presetService.getPreset(data.presetId);
			if (preset) {
				fetchUrl = preset.url;
				logger.info('[ExternalPreview API] Using preset URL', {
					presetId: data.presetId,
					url: fetchUrl
				});
			}
		}

		if (!fetchUrl) {
			return json({ error: 'No URL provided' }, { status: 400 });
		}

		logger.info('[ExternalPreview API] Fetching external list', {
			url: fetchUrl,
			mediaType: data.mediaType,
			isTest
		});

		// Get the JSON provider
		const provider = providerRegistry.get('external-json');
		if (!provider) {
			return json({ error: 'External JSON provider not available' }, { status: 500 });
		}

		// Fetch items from external source
		const result = await provider.fetchItems(
			{ url: fetchUrl, headers: data.headers },
			data.mediaType
		);

		if (result.error) {
			return json({ error: result.error }, { status: 400 });
		}

		logger.info('[ExternalPreview API] Fetched external items', {
			totalCount: result.totalCount,
			failedCount: result.failedCount
		});

		// For test endpoint, just return counts without resolving IDs
		if (isTest) {
			return json({
				success: true,
				totalCount: result.totalCount,
				failedCount: result.failedCount
			});
		}

		// Resolve external items to TMDB items
		const resolvedItems = [];
		const seenIds = new Set<number>();
		let resolvedCount = 0;
		let failedCount = 0;
		let duplicatesRemoved = 0;

		for (const item of result.items) {
			const resolution = await externalIdResolver.resolveItem(item, data.mediaType);

			if (resolution.success && resolution.tmdbId) {
				// Check for duplicates
				if (seenIds.has(resolution.tmdbId)) {
					duplicatesRemoved++;
					logger.debug('[ExternalPreview API] Duplicate item removed', {
						tmdbId: resolution.tmdbId,
						title: resolution.title
					});
					continue;
				}
				seenIds.add(resolution.tmdbId);

				resolvedItems.push({
					id: resolution.tmdbId,
					title: resolution.title,
					name: data.mediaType === 'tv' ? resolution.title : undefined,
					poster_path: item.posterPath ?? resolution.posterPath,
					vote_average: item.voteAverage ?? 0,
					release_date: item.year ? `${item.year}-01-01` : undefined,
					first_air_date: item.year ? `${item.year}-01-01` : undefined,
					overview: item.overview,
					inLibrary: false // Will be set below
				});
				resolvedCount++;
			} else {
				failedCount++;
			}
		}

		// Check which items are already in the library
		const tmdbIds = resolvedItems.map((item) => item.id);
		const libraryTmdbIds = new Set<number>();

		if (tmdbIds.length > 0) {
			if (data.mediaType === 'movie') {
				const libraryMovies = await db.select({ tmdbId: movies.tmdbId }).from(movies);
				for (const movie of libraryMovies) {
					if (tmdbIds.includes(movie.tmdbId)) {
						libraryTmdbIds.add(movie.tmdbId);
					}
				}
			} else {
				const librarySeries = await db.select({ tmdbId: series.tmdbId }).from(series);
				for (const show of librarySeries) {
					if (tmdbIds.includes(show.tmdbId)) {
						libraryTmdbIds.add(show.tmdbId);
					}
				}
			}
		}

		// Add inLibrary flag to each item
		const itemsWithLibraryStatus = resolvedItems.map((item) => ({
			...item,
			inLibrary: libraryTmdbIds.has(item.id)
		}));

		logger.info('[ExternalPreview API] Resolved items', {
			resolvedCount,
			failedCount,
			duplicatesRemoved,
			inLibrary: libraryTmdbIds.size
		});

		return json({
			items: itemsWithLibraryStatus,
			totalResults: resolvedItems.length,
			totalPages: 1,
			unfilteredTotal: result.totalCount,
			resolvedCount,
			failedCount,
			duplicatesRemoved
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			logger.error('[ExternalPreview API] Validation error', { issues: error.issues });
			return json({ error: 'Validation failed', details: error.issues }, { status: 400 });
		}
		logger.error('[ExternalPreview API] Error', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
