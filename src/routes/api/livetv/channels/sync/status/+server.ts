/**
 * Sync Status API Endpoint
 *
 * GET /api/livetv/channels/sync/status - Get sync status for all accounts
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerChannelService } from '$lib/server/livetv/stalker';

export const GET: RequestHandler = async () => {
	const channelService = getStalkerChannelService();

	try {
		const accounts = await channelService.getAccountSyncStatuses();
		return json({ accounts });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
