/**
 * Test Stalker Account Configuration API
 *
 * POST /api/livetv/accounts/test - Test a new account configuration (without saving)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerAccountManager } from '$lib/server/livetv/stalker';
import { stalkerAccountTestSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';

/**
 * Test a Stalker account configuration without saving
 * Useful for validating credentials before creating an account
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = stalkerAccountTestSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					success: false,
					error: 'Validation failed',
					details: parsed.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const manager = getStalkerAccountManager();
		const result = await manager.testAccount(parsed.data);

		return json(result);
	} catch (error) {
		logger.error('[API] Failed to test Stalker account configuration', {
			error: error instanceof Error ? error.message : String(error)
		});

		return json(
			{
				success: false,
				error: 'Failed to test account configuration'
			},
			{ status: 500 }
		);
	}
};
