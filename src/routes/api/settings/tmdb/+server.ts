import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { tmdbApiKeySchema } from '$lib/validation/schemas';
import { z } from 'zod';

const tmdbSettingsSchema = z.object({
	apiKey: z.string().optional().default('')
});

export const GET: RequestHandler = async () => {
	const apiKeySetting = await db.query.settings.findFirst({
		where: eq(settings.key, 'tmdb_api_key')
	});

	return json({
		success: true,
		hasApiKey: Boolean(apiKeySetting)
	});
};

export const PUT: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsedBody = tmdbSettingsSchema.safeParse(body);
	if (!parsedBody.success) {
		return json(
			{
				error: 'Validation failed',
				details: parsedBody.error.flatten()
			},
			{ status: 400 }
		);
	}

	const apiKey = parsedBody.data.apiKey.trim();
	if (!apiKey) {
		return json({ success: true, unchanged: true });
	}

	const validation = tmdbApiKeySchema.safeParse(apiKey);
	if (!validation.success) {
		return json(
			{
				error: validation.error.issues[0]?.message ?? 'Invalid TMDB API key'
			},
			{ status: 400 }
		);
	}

	await db
		.insert(settings)
		.values({ key: 'tmdb_api_key', value: apiKey })
		.onConflictDoUpdate({ target: settings.key, set: { value: apiKey } });

	return json({ success: true });
};
