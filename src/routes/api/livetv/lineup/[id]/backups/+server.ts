/**
 * API endpoints for channel lineup backup links
 * GET /api/livetv/lineup/[id]/backups - Get all backups for a lineup item
 * POST /api/livetv/lineup/[id]/backups - Add a backup link
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup/ChannelLineupService';
import type { AddBackupLinkRequest } from '$lib/types/livetv';

/**
 * Get all backup links for a lineup item
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Verify lineup item exists
	const item = await channelLineupService.getChannelById(id);
	if (!item) {
		return json({ error: 'Lineup item not found' }, { status: 404 });
	}

	const backups = await channelLineupService.getBackups(id);
	return json({ backups });
};

/**
 * Add a backup link to a lineup item
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	// Verify lineup item exists
	const item = await channelLineupService.getChannelById(id);
	if (!item) {
		return json({ error: 'Lineup item not found' }, { status: 404 });
	}

	let body: AddBackupLinkRequest;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.accountId || !body.channelId) {
		return json({ error: 'Missing required fields: accountId, channelId' }, { status: 400 });
	}

	// Prevent adding primary channel as backup
	if (body.channelId === item.channelId) {
		return json({ error: 'Cannot add primary channel as backup' }, { status: 400 });
	}

	const backup = await channelLineupService.addBackup(id, body.accountId, body.channelId);

	if (!backup) {
		return json({ error: 'Failed to add backup. It may already exist.' }, { status: 400 });
	}

	return json(backup, { status: 201 });
};
