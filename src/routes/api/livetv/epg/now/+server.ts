/**
 * EPG Now/Next API
 *
 * GET /api/livetv/epg/now - Get current and next program for all lineup channels
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService } from '$lib/server/livetv/epg';
import { channelLineupService } from '$lib/server/livetv/lineup';
import type { EpgProgram, EpgProgramWithProgress } from '$lib/types/livetv';

interface NowNextEntry {
	now: EpgProgramWithProgress | null;
	next: EpgProgram | null;
}

export const GET: RequestHandler = async () => {
	try {
		const epgService = getEpgService();

		// Get lineup channel IDs
		const lineupChannelIds = await channelLineupService.getLineupChannelIds();
		const channelIds = Array.from(lineupChannelIds);

		if (channelIds.length === 0) {
			return json({ channels: {} });
		}

		// Get now/next for all lineup channels
		const nowNextMap = epgService.getNowAndNext(channelIds);

		// Convert map to object for JSON
		const channels: Record<string, NowNextEntry> = {};

		for (const [channelId, data] of nowNextMap) {
			channels[channelId] = {
				now: data.now,
				next: data.next
			};
		}

		return json({ channels });
	} catch (error) {
		console.error('[API] Failed to get EPG now/next:', error);
		return json({ error: 'Failed to get EPG data' }, { status: 500 });
	}
};
