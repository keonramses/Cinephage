/**
 * Single Lineup Item API
 *
 * GET /api/livetv/lineup/[id] - Get single lineup item
 * PUT /api/livetv/lineup/[id] - Update lineup item
 * DELETE /api/livetv/lineup/[id] - Remove from lineup
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { ValidationError } from '$lib/errors';
import type { UpdateChannelRequest } from '$lib/types/livetv';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const item = await channelLineupService.getChannelById(params.id);

		if (!item) {
			return json({ error: 'Lineup item not found' }, { status: 404 });
		}

		return json(item);
	} catch (error) {
		console.error('[API] Failed to get lineup item:', error);
		return json({ error: 'Failed to get lineup item' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = (await request.json()) as UpdateChannelRequest;

		const item = await channelLineupService.updateChannel(params.id, body);

		if (!item) {
			return json({ error: 'Lineup item not found' }, { status: 404 });
		}

		return json(item);
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[API] Failed to update lineup item:', error);
		return json({ error: 'Failed to update lineup item' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const success = await channelLineupService.removeFromLineup(params.id);

		if (!success) {
			return json({ error: 'Lineup item not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('[API] Failed to remove from lineup:', error);
		return json({ error: 'Failed to remove from lineup' }, { status: 500 });
	}
};
