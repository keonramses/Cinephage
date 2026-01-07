/**
 * POST /api/notifications/mediabrowser/:id/test - Test a saved server's connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';

/**
 * POST /api/notifications/mediabrowser/:id/test
 * Test connection for an existing MediaBrowser server.
 * Updates the server's test status in the database.
 */
export const POST: RequestHandler = async ({ params }) => {
	const manager = getMediaBrowserManager();

	try {
		const testResult = await manager.testServer(params.id);
		return json(testResult);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ success: false, error: message });
	}
};
