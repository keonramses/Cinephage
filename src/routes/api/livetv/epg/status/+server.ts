/**
 * EPG Status API
 *
 * GET /api/livetv/epg/status - Get EPG sync status and statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService } from '$lib/server/livetv/epg';
import { db } from '$lib/server/db';
import { stalkerAccounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		const epgService = getEpgService();

		// Get total program count
		const totalPrograms = epgService.getProgramCount();

		// Get program count by account
		const programsByAccount = epgService.getProgramCountByAccount();

		// Get all enabled accounts
		const accounts = db
			.select({
				id: stalkerAccounts.id,
				name: stalkerAccounts.name,
				lastSyncAt: stalkerAccounts.lastSyncAt,
				lastSyncError: stalkerAccounts.lastSyncError
			})
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.enabled, true))
			.all();

		// Build account status list
		const accountStatuses = accounts.map((account) => ({
			id: account.id,
			name: account.name,
			lastSyncAt: account.lastSyncAt,
			programCount: programsByAccount.get(account.id) ?? 0,
			error: account.lastSyncError ?? undefined
		}));

		return json({
			isEnabled: true,
			syncIntervalHours: 6, // Default
			retentionHours: 48, // Default
			lastSyncAt: null, // Would need to track this separately
			nextSyncAt: null, // Would need scheduler to calculate this
			totalPrograms,
			accounts: accountStatuses
		});
	} catch (error) {
		console.error('[API] Failed to get EPG status:', error);
		return json({ error: 'Failed to get EPG status' }, { status: 500 });
	}
};
