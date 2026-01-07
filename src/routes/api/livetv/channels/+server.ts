/**
 * Channels API Endpoint
 *
 * GET /api/livetv/channels - List cached channels with filtering and pagination
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerChannelService } from '$lib/server/livetv/stalker';
import type { ChannelQueryOptions } from '$lib/types/livetv';

export const GET: RequestHandler = async ({ url }) => {
	const channelService = getStalkerChannelService();

	// Parse query parameters
	const accountIdsParam = url.searchParams.get('accountIds');
	const categoryIdsParam = url.searchParams.get('categoryIds');
	const search = url.searchParams.get('search');
	const hasArchiveParam = url.searchParams.get('hasArchive');
	const pageParam = url.searchParams.get('page');
	const pageSizeParam = url.searchParams.get('pageSize');
	const sortBy = url.searchParams.get('sortBy') as ChannelQueryOptions['sortBy'];
	const sortOrder = url.searchParams.get('sortOrder') as ChannelQueryOptions['sortOrder'];

	const options: ChannelQueryOptions = {};

	if (accountIdsParam) {
		options.accountIds = accountIdsParam.split(',').filter(Boolean);
	}

	if (categoryIdsParam) {
		options.categoryIds = categoryIdsParam.split(',').filter(Boolean);
	}

	if (search) {
		options.search = search;
	}

	if (hasArchiveParam) {
		options.hasArchive = hasArchiveParam === 'true';
	}

	if (pageParam) {
		const page = parseInt(pageParam, 10);
		if (!isNaN(page) && page > 0) {
			options.page = page;
		}
	}

	if (pageSizeParam) {
		const pageSize = parseInt(pageSizeParam, 10);
		if (!isNaN(pageSize) && pageSize > 0) {
			options.pageSize = pageSize;
		}
	}

	if (sortBy && ['name', 'number', 'category'].includes(sortBy)) {
		options.sortBy = sortBy;
	}

	if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
		options.sortOrder = sortOrder;
	}

	try {
		const result = await channelService.getChannels(options);
		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
