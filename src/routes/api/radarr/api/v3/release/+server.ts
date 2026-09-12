import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { requireArrCompatEnabled } from '$lib/server/arr/requireArrCompatEnabled.js';
import { searchReleasesForMovie, grabRelease } from '$lib/server/arr/release.js';

/** GET /api/radarr/api/v3/release?movieId=... */
export const GET: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const movieId = Number.parseInt(event.url.searchParams.get('movieId') ?? '', 10);
	if (Number.isNaN(movieId)) return json([]);

	return json(await searchReleasesForMovie(event.fetch, movieId));
};

/** POST /api/radarr/api/v3/release - grab the posted release. */
export const POST: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const body = await event.request.json().catch(() => ({}));
	const result = await grabRelease(event.fetch, 'Radarr', body);
	return json(result.body, { status: result.status });
};
