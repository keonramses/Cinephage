/**
 * Live TV Accounts API
 *
 * GET  /api/livetv/accounts - List all Stalker accounts
 * POST /api/livetv/accounts - Create a new Stalker account
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerAccountManager } from '$lib/server/livetv/stalker';
import { stalkerAccountCreateSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';

/**
 * List all Stalker accounts
 */
export const GET: RequestHandler = async () => {
	try {
		const manager = getStalkerAccountManager();
		const accounts = await manager.getAccounts();

		return json(accounts);
	} catch (error) {
		logger.error('[API] Failed to list Stalker accounts', {
			error: error instanceof Error ? error.message : String(error)
		});

		return json({ error: 'Failed to list accounts' }, { status: 500 });
	}
};

/**
 * Create a new Stalker account
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = stalkerAccountCreateSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					error: 'Validation failed',
					details: parsed.error.flatten().fieldErrors
				},
				{ status: 400 }
			);
		}

		const manager = getStalkerAccountManager();

		// Check if testFirst is explicitly set to false
		const testFirst = body.testFirst !== false;

		const account = await manager.createAccount(parsed.data, testFirst);

		return json(account, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		logger.error('[API] Failed to create Stalker account', { error: message });

		// Connection test failures return specific error
		if (message.includes('Connection test failed')) {
			return json({ error: message }, { status: 400 });
		}

		// Unique constraint violation
		if (message.includes('UNIQUE constraint failed')) {
			return json(
				{ error: 'An account with this portal URL and MAC address already exists' },
				{ status: 409 }
			);
		}

		return json({ error: 'Failed to create account' }, { status: 500 });
	}
};
