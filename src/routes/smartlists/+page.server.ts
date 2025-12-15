/**
 * Smart Lists Page - Server Load
 */

import type { PageServerLoad } from './$types';
import { getSmartListService } from '$lib/server/smartlists/index.js';

export const load: PageServerLoad = async () => {
	const service = getSmartListService();
	const lists = await service.getAllSmartLists();

	return {
		lists
	};
};
