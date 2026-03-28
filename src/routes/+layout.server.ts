import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db/index.js';
import { rootFolders } from '$lib/server/db/schema.js';

export const load: LayoutServerLoad = async () => {
	try {
		const folders = await db
			.select({
				mediaType: rootFolders.mediaType,
				mediaSubType: rootFolders.mediaSubType
			})
			.from(rootFolders);

		const hasAnimeMovies = folders.some(
			(folder) => folder.mediaType === 'movie' && (folder.mediaSubType ?? 'standard') === 'anime'
		);
		const hasAnimeSeries = folders.some(
			(folder) => folder.mediaType === 'tv' && (folder.mediaSubType ?? 'standard') === 'anime'
		);

		return {
			libraryNav: {
				hasAnimeMovies,
				hasAnimeSeries
			}
		};
	} catch {
		return {
			libraryNav: {
				hasAnimeMovies: false,
				hasAnimeSeries: false
			}
		};
	}
};
