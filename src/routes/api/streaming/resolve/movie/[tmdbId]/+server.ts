/**
 * Stream Resolve Endpoint - Movies
 * Extracts stream from providers and returns HLS playlist directly
 * (Jellyfin doesn't follow redirects for .strm files)
 *
 * GET /api/streaming/resolve/movie/[tmdbId]
 */

import type { RequestHandler } from './$types';
import { fetchAndRewritePlaylist } from '$lib/server/streaming/utils';
import { StreamWorker, streamWorkerRegistry, workerManager } from '$lib/server/workers';
import { getPreferredLanguagesForMovie } from '$lib/server/streaming/language-profile-helper';

/** Create JSON error response */
function errorResponse(message: string, code: string, status: number): Response {
	return new Response(JSON.stringify({ error: message, code }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const GET: RequestHandler = async ({ params, request }) => {
	const tmdbId = params.tmdbId;

	if (!tmdbId) {
		return errorResponse('Missing TMDB ID', 'MISSING_PARAM', 400);
	}

	// Validate tmdbId is numeric
	if (!/^\d+$/.test(tmdbId)) {
		return errorResponse('Invalid TMDB ID format', 'INVALID_PARAM', 400);
	}

	const tmdbIdNum = parseInt(tmdbId, 10);

	// Create or find existing stream worker for this media
	let worker = streamWorkerRegistry.findByMedia(tmdbIdNum, 'movie');

	if (!worker) {
		worker = new StreamWorker({
			mediaType: 'movie',
			tmdbId: tmdbIdNum
		});

		try {
			workerManager.spawn(worker);
			streamWorkerRegistry.register(worker);
			// Start the worker in background (it will wait for complete/fail)
			workerManager.spawnInBackground(worker);
		} catch (e) {
			// Concurrency limit reached - still process request, just without worker tracking
			worker.log(
				'warn',
				`Could not create worker: ${e instanceof Error ? e.message : 'Unknown error'}`
			);
			worker = undefined as unknown as StreamWorker;
		}
	}

	worker?.extractionStarted();

	try {
		// Dynamic imports to isolate any module loading errors
		const { extractStreams, streamCache, getBestQualityStreamUrl, getBaseUrlAsync } =
			await import('$lib/server/streaming');
		const baseUrl = await getBaseUrlAsync(request);

		// Cache key stores { rawUrl, referer } as JSON for direct fetching
		const cacheKey = `stream:movie:${tmdbId}:best`;
		const cachedJson = streamCache.get(cacheKey);

		if (cachedJson) {
			try {
				const cached = JSON.parse(cachedJson) as { rawUrl: string; referer: string };
				worker?.cacheHit();
				// Fetch the playlist directly and rewrite URLs for proxy
				return await fetchAndRewritePlaylist(cached.rawUrl, cached.referer, baseUrl);
			} catch {
				// Invalid cache entry, continue with extraction
			}
		}

		// Try to get metadata from TMDB (optional - but improves provider matching)
		let imdbId: string | undefined;
		let title: string | undefined;
		let year: number | undefined;

		try {
			const { tmdb } = await import('$lib/server/tmdb');

			// Fetch external IDs
			const externalIds = await tmdb.getMovieExternalIds(tmdbIdNum);
			imdbId = externalIds.imdb_id || undefined;

			// Fetch movie details for title and year
			const movieDetails = await tmdb.getMovie(tmdbIdNum);
			title = movieDetails.title;
			year = movieDetails.release_date
				? parseInt(movieDetails.release_date.substring(0, 4), 10)
				: undefined;
		} catch {
			// TMDB lookup failed - extraction can still work for most providers
		}

		// Get user's preferred languages for stream selection
		let preferredLanguages: string[] = [];
		try {
			preferredLanguages = await getPreferredLanguagesForMovie(tmdbIdNum);
		} catch {
			// Language profile lookup failed - continue without language preference
		}

		// Extract streams from providers
		const result = await extractStreams({
			tmdbId,
			type: 'movie',
			imdbId,
			title,
			year,
			preferredLanguages
		});

		if (!result.success || result.sources.length === 0) {
			worker?.fail(result.error || 'No sources found');
			return errorResponse(
				`Stream extraction failed: ${result.error || 'No sources found'}`,
				'EXTRACTION_FAILED',
				503
			);
		}

		// Find first working source
		const workingSource = result.sources.find((s) => s.status === 'working') || result.sources[0];

		if (!workingSource) {
			worker?.fail('No working stream sources');
			return errorResponse('No working stream sources', 'NO_SOURCES', 503);
		}

		// Record successful extraction
		worker?.extractionSucceeded(result.provider || 'unknown', workingSource.quality);

		// Get the best quality stream URL by parsing the HLS master playlist
		// This returns the RAW URL, not a proxy URL
		const bestResult = await getBestQualityStreamUrl(
			workingSource.url,
			workingSource.referer
		);

		// Cache the raw URL and referer for future requests (as JSON string)
		streamCache.set(cacheKey, JSON.stringify({ rawUrl: bestResult.rawUrl, referer: workingSource.referer }));

		// Fetch the playlist directly and rewrite URLs for proxy (no server-to-server loopback)
		return await fetchAndRewritePlaylist(bestResult.rawUrl, workingSource.referer, baseUrl);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		worker?.fail(errorMessage);
		return errorResponse(`Stream extraction error: ${errorMessage}`, 'INTERNAL_ERROR', 500);
	}
};
