/**
 * EPG Channel API
 *
 * GET /api/livetv/epg/channel/[id] - Get programs for a single channel
 *
 * Query parameters:
 * - start: ISO date string (default: now)
 * - end: ISO date string (default: +6 hours)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEpgService } from '$lib/server/livetv/epg';

const DEFAULT_HOURS = 6;

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const channelId = params.id;

		if (!channelId) {
			return json({ error: 'Channel ID is required' }, { status: 400 });
		}

		const epgService = getEpgService();

		// Parse query parameters
		const startParam = url.searchParams.get('start');
		const endParam = url.searchParams.get('end');

		// Default time range: now to +6 hours
		const now = new Date();
		const start = startParam ? new Date(startParam) : now;
		const end = endParam
			? new Date(endParam)
			: new Date(now.getTime() + DEFAULT_HOURS * 60 * 60 * 1000);

		// Validate dates
		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			return json({ error: 'Invalid date format' }, { status: 400 });
		}

		if (start >= end) {
			return json({ error: 'Start must be before end' }, { status: 400 });
		}

		// Get programs for channel
		const programs = epgService.getChannelPrograms(channelId, start, end);

		return json({
			channelId,
			programs,
			timeRange: {
				start: start.toISOString(),
				end: end.toISOString()
			}
		});
	} catch (error) {
		console.error('[API] Failed to get EPG for channel:', error);
		return json({ error: 'Failed to get EPG data' }, { status: 500 });
	}
};
