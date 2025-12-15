/**
 * Smart List Detail Page - Server Load
 */

import type { PageServerLoad } from './$types';
import { getSmartListService } from '$lib/server/smartlists/index.js';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url }) => {
	const service = getSmartListService();
	const list = await service.getSmartList(params.id);

	if (!list) {
		throw error(404, 'Smart list not found');
	}

	const page = parseInt(url.searchParams.get('page') ?? '1');
	const inLibrary = url.searchParams.get('inLibrary');
	const includeExcluded = url.searchParams.get('includeExcluded') === 'true';

	const items = await service.getSmartListItems(params.id, {
		page,
		limit: 50,
		inLibrary: inLibrary === 'true' ? true : inLibrary === 'false' ? false : null,
		includeExcluded
	});

	return {
		list,
		items: items.items,
		pagination: {
			page: items.page,
			totalPages: items.totalPages,
			totalItems: items.totalItems
		}
	};
};
