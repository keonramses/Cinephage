/**
 * Live TV Account by ID API
 *
 * GET    /api/livetv/accounts/[id] - Get account by ID
 * PUT    /api/livetv/accounts/[id] - Update account
 * DELETE /api/livetv/accounts/[id] - Delete account
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStalkerAccountManager } from '$lib/server/livetv/stalker';
import { stalkerAccountUpdateSchema } from '$lib/validation/schemas';
import { logger } from '$lib/logging';

/**
 * Get a Stalker account by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const manager = getStalkerAccountManager();
		const account = await manager.getAccount(params.id);

		if (!account) {
			return json({ error: 'Account not found' }, { status: 404 });
		}

		return json(account);
	} catch (error) {
		logger.error('[API] Failed to get Stalker account', {
			id: params.id,
			error: error instanceof Error ? error.message : String(error)
		});

		return json({ error: 'Failed to get account' }, { status: 500 });
	}
};

/**
 * Update a Stalker account
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();

		// Validate input
		const parsed = stalkerAccountUpdateSchema.safeParse(body);
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
		const account = await manager.updateAccount(params.id, parsed.data);

		if (!account) {
			return json({ error: 'Account not found' }, { status: 404 });
		}

		return json(account);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		logger.error('[API] Failed to update Stalker account', {
			id: params.id,
			error: message
		});

		// Unique constraint violation
		if (message.includes('UNIQUE constraint failed')) {
			return json(
				{ error: 'An account with this portal URL and MAC address already exists' },
				{ status: 409 }
			);
		}

		return json({ error: 'Failed to update account' }, { status: 500 });
	}
};

/**
 * Delete a Stalker account
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const manager = getStalkerAccountManager();
		const deleted = await manager.deleteAccount(params.id);

		if (!deleted) {
			return json({ error: 'Account not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		logger.error('[API] Failed to delete Stalker account', {
			id: params.id,
			error: error instanceof Error ? error.message : String(error)
		});

		return json({ error: 'Failed to delete account' }, { status: 500 });
	}
};
