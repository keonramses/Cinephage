/**
 * Bulk Remove from Lineup API
 *
 * POST /api/livetv/lineup/remove - Remove multiple items from lineup
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { ValidationError } from '$lib/errors';
import type { RemoveFromLineupRequest } from '$lib/types/livetv';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as RemoveFromLineupRequest;

		if (!body.itemIds || !Array.isArray(body.itemIds)) {
			throw new ValidationError('itemIds array is required');
		}

		if (body.itemIds.length === 0) {
			return json({ removed: 0 });
		}

		const removed = await channelLineupService.bulkRemoveFromLineup(body.itemIds);

		return json({ removed });
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[API] Failed to remove from lineup:', error);
		return json({ error: 'Failed to remove from lineup' }, { status: 500 });
	}
};
