import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { requireArrCompatEnabled } from '$lib/server/arr/requireArrCompatEnabled.js';
import { buildSeriesByArrId } from '$lib/server/arr/series.js';

/** GET /api/sonarr/api/v3/series/{id} */
export const GET: RequestHandler = async (event) => {
	const disabledError = requireArrCompatEnabled();
	if (disabledError) return disabledError;

	const authError = requireAdmin(event);
	if (authError) return authError;

	const id = Number.parseInt(event.params.id, 10);
	if (Number.isNaN(id)) error(400, 'Invalid series id');

	const item = await buildSeriesByArrId(id);
	if (!item) error(404, 'Series not found');

	return json(item);
};
