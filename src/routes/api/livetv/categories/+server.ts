/**
 * Categories API Endpoint
 *
 * GET /api/livetv/categories - List cached categories for filtering
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerChannelService } from '$lib/server/livetv/stalker';

export const GET: RequestHandler = async ({ url }) => {
	const channelService = getStalkerChannelService();

	// Parse query parameters
	const accountIdsParam = url.searchParams.get('accountIds');
	const accountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : undefined;

	try {
		const categories = await channelService.getCategories(accountIds);
		return json({ categories });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
