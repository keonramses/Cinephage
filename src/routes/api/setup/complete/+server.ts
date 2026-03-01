import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';

export const POST: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		// Mark setup as complete in settings table
		await db
			.insert(settings)
			.values({ key: 'setup_complete', value: 'true' })
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: 'true' }
			});

		return json({ success: true });
	} catch (error) {
		console.error('Error marking setup complete:', error);
		return json({ error: 'Failed to mark setup complete' }, { status: 500 });
	}
};
