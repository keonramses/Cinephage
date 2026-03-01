import type { PageServerLoad } from './$types';
import { getRootFolderService } from '$lib/server/downloadClients/RootFolderService';

export const load: PageServerLoad = async () => {
	const rootFolderService = getRootFolderService();
	const rootFolders = await rootFolderService.getFolders();

	return {
		rootFolders
	};
};
