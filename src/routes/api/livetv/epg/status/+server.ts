/**
 * EPG Status API
 *
 * GET /api/livetv/epg/status - Get EPG sync status and statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService, getEpgScheduler } from '$lib/server/livetv/epg';
import { db } from '$lib/server/db';
import { stalkerAccounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		const epgService = getEpgService();
		const epgScheduler = getEpgScheduler();

		// Get scheduler status for sync info
		const schedulerStatus = epgScheduler.getStatus();

		// Get total program count
		const totalPrograms = epgService.getProgramCount();

		// Get all enabled accounts with EPG tracking columns
		const accounts = db
			.select({
				id: stalkerAccounts.id,
				name: stalkerAccounts.name,
				lastEpgSyncAt: stalkerAccounts.lastEpgSyncAt,
				lastEpgSyncError: stalkerAccounts.lastEpgSyncError,
				epgProgramCount: stalkerAccounts.epgProgramCount,
				hasEpg: stalkerAccounts.hasEpg
			})
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.enabled, true))
			.all();

		// Build account status list
		const accountStatuses = accounts.map((account) => ({
			id: account.id,
			name: account.name,
			lastEpgSyncAt: account.lastEpgSyncAt ?? null,
			programCount: account.epgProgramCount ?? 0,
			hasEpg: account.hasEpg ?? null,
			error: account.lastEpgSyncError ?? undefined
		}));

		return json({
			isEnabled: true,
			isSyncing: schedulerStatus.isSyncing,
			syncIntervalHours: schedulerStatus.syncIntervalHours,
			retentionHours: schedulerStatus.retentionHours,
			lastSyncAt: schedulerStatus.lastSyncAt,
			nextSyncAt: schedulerStatus.nextSyncAt,
			totalPrograms,
			accounts: accountStatuses
		});
	} catch (error) {
		console.error('[API] Failed to get EPG status:', error);
		return json({ error: 'Failed to get EPG status' }, { status: 500 });
	}
};
