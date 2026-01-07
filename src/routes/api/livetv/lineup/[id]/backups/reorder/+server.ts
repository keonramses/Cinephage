/**
 * API endpoint for reordering backup links
 * PUT /api/livetv/lineup/[id]/backups/reorder - Reorder backup priorities
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import type { ReorderBackupsRequest } from '$lib/types/livetv';

/**
 * Reorder backup links for a lineup item
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	// Verify lineup item exists
	const item = await channelLineupService.getChannelById(id);
	if (!item) {
		return json({ error: 'Lineup item not found' }, { status: 404 });
	}

	let body: ReorderBackupsRequest;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.backupIds || !Array.isArray(body.backupIds)) {
		return json({ error: 'Missing required field: backupIds (array)' }, { status: 400 });
	}

	await channelLineupService.reorderBackups(id, body.backupIds);

	// Return updated backups
	const backups = await channelLineupService.getBackups(id);
	return json({ backups });
};
