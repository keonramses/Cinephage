import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExtractionCacheManager } from '$lib/server/streaming/nzb/extraction/ExtractionCacheManager';

export const POST: RequestHandler = async () => {
	const cacheManager = getExtractionCacheManager();
	const result = await cacheManager.runCleanup();

	return json({
		success: true,
		cleaned: result.cleaned,
		freedMB: Math.round(result.freedBytes / 1024 / 1024)
	});
};
