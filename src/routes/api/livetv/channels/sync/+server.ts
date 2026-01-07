/**
 * Channel Sync API Endpoint
 *
 * POST /api/livetv/channels/sync - Trigger channel sync for accounts
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerChannelSyncService, getStalkerAccountManager } from '$lib/server/livetv/stalker';

export const POST: RequestHandler = async ({ request }) => {
	const syncService = getStalkerChannelSyncService();
	const accountManager = getStalkerAccountManager();

	try {
		const body = await request.json().catch(() => ({}));
		const { accountIds } = body as { accountIds?: string[] };

		// If no specific accounts, sync all enabled accounts
		if (!accountIds || accountIds.length === 0) {
			const results = await syncService.syncAllAccounts();

			const resultsObj: Record<string, unknown> = {};
			for (const [id, result] of results) {
				resultsObj[id] = result;
			}

			return json({ results: resultsObj });
		}

		// Sync specific accounts
		const results: Record<string, unknown> = {};

		for (const accountId of accountIds) {
			// Verify account exists
			const account = await accountManager.getAccount(accountId);
			if (!account) {
				results[accountId] = {
					success: false,
					error: 'Account not found'
				};
				continue;
			}

			const result = await syncService.syncAccount(accountId);
			results[accountId] = result;
		}

		return json({ results });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
