import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { globalTmdbFiltersSchema } from '$lib/validation/schemas';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import type { GlobalTmdbFilters } from '$lib/types/tmdb';

const DEFAULT_FILTERS: GlobalTmdbFilters = {
	include_adult: false,
	min_vote_average: 0,
	min_vote_count: 0,
	language: 'en-US',
	region: 'US',
	excluded_genre_ids: []
};

export const GET: RequestHandler = async () => {
	const settingsData = await db.query.settings.findFirst({
		where: eq(settings.key, 'global_filters')
	});

	if (!settingsData) {
		return json({ success: true, filters: DEFAULT_FILTERS });
	}

	try {
		const stored = JSON.parse(settingsData.value) as Partial<GlobalTmdbFilters>;
		return json({
			success: true,
			filters: {
				...DEFAULT_FILTERS,
				...stored
			}
		});
	} catch (error) {
		logger.error('Failed to parse global_filters', error);
		return json({ success: true, filters: DEFAULT_FILTERS });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = globalTmdbFiltersSchema.safeParse(data);
	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	await db
		.insert(settings)
		.values({
			key: 'global_filters',
			value: JSON.stringify(result.data)
		})
		.onConflictDoUpdate({
			target: settings.key,
			set: { value: JSON.stringify(result.data) }
		});

	return json({ success: true, filters: result.data });
};
