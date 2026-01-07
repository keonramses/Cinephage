/**
 * Test Existing Stalker Account API
 *
 * POST /api/livetv/accounts/[id]/test - Test an existing account connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerAccountManager } from '$lib/server/livetv/stalker';
import { logger } from '$lib/logging';

/**
 * Test an existing Stalker account by ID
 * Updates the account's test results and metadata
 */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const manager = getStalkerAccountManager();
		const result = await manager.testAccountById(params.id);

		if (!result.success && result.error === 'Account not found') {
			return json({ error: 'Account not found' }, { status: 404 });
		}

		return json(result);
	} catch (error) {
		logger.error('[API] Failed to test Stalker account', {
			id: params.id,
			error: error instanceof Error ? error.message : String(error)
		});

		return json(
			{
				success: false,
				error: 'Failed to test account'
			},
			{ status: 500 }
		);
	}
};
