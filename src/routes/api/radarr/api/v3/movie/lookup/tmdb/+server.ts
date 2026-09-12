import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { requireArrCompatEnabled } from '$lib/server/arr/requireArrCompatEnabled.js';
import { buildMovieLookupByTmdbId } from '$lib/server/arr/movies.js';

/** GET /api/radarr/api/v3/movie/lookup/tmdb?tmdbId=... */
export const GET: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const tmdbId = Number.parseInt(event.url.searchParams.get('tmdbId') ?? '', 10);
	if (Number.isNaN(tmdbId)) error(400, 'tmdbId is required');

	const movie = await buildMovieLookupByTmdbId(tmdbId);
	if (!movie) error(404, 'Movie not found');

	return json(movie);
};
