/**
 * Channel Lineup API
 *
 * GET /api/livetv/lineup - Get all lineup items
 * POST /api/livetv/lineup - Add channels to lineup
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { ValidationError } from '$lib/errors';
import type { AddToLineupRequest } from '$lib/types/livetv';

export const GET: RequestHandler = async () => {
	try {
		const lineup = await channelLineupService.getLineup();
		const lineupChannelIds = await channelLineupService.getLineupChannelIds();

		return json({
			lineup,
			lineupChannelIds: Array.from(lineupChannelIds),
			total: lineup.length
		});
	} catch (error) {
		console.error('[API] Failed to get lineup:', error);
		return json({ error: 'Failed to get lineup' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as AddToLineupRequest;

		if (!body.channels || !Array.isArray(body.channels)) {
			throw new ValidationError('channels array is required');
		}

		if (body.channels.length === 0) {
			return json({ added: 0, skipped: 0 });
		}

		// Validate each channel has required fields
		for (const channel of body.channels) {
			if (!channel.accountId || !channel.channelId) {
				throw new ValidationError('Each channel must have accountId and channelId');
			}
		}

		const result = await channelLineupService.addToLineup(body);

		return json(result, { status: 201 });
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[API] Failed to add to lineup:', error);
		return json({ error: 'Failed to add to lineup' }, { status: 500 });
	}
};
