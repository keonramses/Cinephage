import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { getSystemSettingsService } from '$lib/server/settings/SystemSettingsService.js';
import { z } from 'zod';

const externalUrlSchema = z.object({
	url: z.string().url().nullable().or(z.literal(''))
});

export const POST: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;

	try {
		const body = await request.json();
		const result = externalUrlSchema.safeParse(body);

		if (!result.success) {
			return json({ error: 'Invalid URL format' }, { status: 400 });
		}

		const { url } = result.data;
		const settingsService = getSystemSettingsService();

		// If url is empty string, treat as null
		await settingsService.setExternalUrl(url || null);

		return json({ success: true, url: url || null });
	} catch (error) {
		console.error('Error saving external URL:', error);
		return json({ error: 'Failed to save external URL' }, { status: 500 });
	}
};

export const GET: RequestHandler = async (event) => {
	// Require admin authentication
	const authError = requireAdmin(event);
	if (authError) return authError;

	try {
		const settingsService = getSystemSettingsService();
		const url = await settingsService.getExternalUrl();

		return json({ url });
	} catch (error) {
		console.error('Error getting external URL:', error);
		return json({ error: 'Failed to get external URL' }, { status: 500 });
	}
};
