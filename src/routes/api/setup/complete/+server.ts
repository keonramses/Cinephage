import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals }) => {
	// Require authentication (only admin can mark setup complete)
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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
