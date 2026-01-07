/**
 * API endpoint for managing a specific backup link
 * DELETE /api/livetv/lineup/[id]/backups/[backupId] - Remove a backup link
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';

/**
 * Remove a backup link
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const { id, backupId } = params;

	// Verify lineup item exists
	const item = await channelLineupService.getChannelById(id);
	if (!item) {
		return json({ error: 'Lineup item not found' }, { status: 404 });
	}

	const success = await channelLineupService.removeBackup(backupId);

	if (!success) {
		return json({ error: 'Backup not found' }, { status: 404 });
	}

	return json({ success: true });
};
