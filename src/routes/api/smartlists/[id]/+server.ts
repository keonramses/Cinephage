/**
 * Smart List API - Single resource endpoints
 * GET /api/smartlists/[id] - Get a smart list
 * PUT /api/smartlists/[id] - Update a smart list
 * DELETE /api/smartlists/[id] - Delete a smart list
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSmartListService } from '$lib/server/smartlists/index.js';
import { z } from 'zod';

const updateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional().nullable(),
	filters: z
		.object({
			withGenres: z.array(z.number()).optional(),
			withoutGenres: z.array(z.number()).optional(),
			genreMode: z.enum(['and', 'or']).optional(),
			yearMin: z.number().optional(),
			yearMax: z.number().optional(),
			releaseDateMin: z.string().optional(),
			releaseDateMax: z.string().optional(),
			voteAverageMin: z.number().min(0).max(10).optional(),
			voteAverageMax: z.number().min(0).max(10).optional(),
			voteCountMin: z.number().optional(),
			popularityMin: z.number().optional(),
			popularityMax: z.number().optional(),
			withCast: z.array(z.number()).optional(),
			withCrew: z.array(z.number()).optional(),
			withKeywords: z.array(z.number()).optional(),
			withoutKeywords: z.array(z.number()).optional(),
			withWatchProviders: z.array(z.number()).optional(),
			watchRegion: z.string().optional(),
			certification: z.string().optional(),
			certificationCountry: z.string().optional(),
			runtimeMin: z.number().optional(),
			runtimeMax: z.number().optional(),
			withOriginalLanguage: z.string().optional(),
			withStatus: z.string().optional(),
			withReleaseType: z.array(z.number()).optional()
		})
		.optional(),
	sortBy: z
		.enum([
			'popularity.desc',
			'popularity.asc',
			'vote_average.desc',
			'vote_average.asc',
			'primary_release_date.desc',
			'primary_release_date.asc',
			'first_air_date.desc',
			'first_air_date.asc',
			'revenue.desc',
			'revenue.asc',
			'title.asc',
			'title.desc'
		])
		.optional(),
	itemLimit: z.number().min(1).max(1000).optional(),
	excludeInLibrary: z.boolean().optional(),
	showUpgradeableOnly: z.boolean().optional(),
	excludedTmdbIds: z.array(z.number()).optional(),
	scoringProfileId: z.string().optional().nullable(),
	autoAddBehavior: z.enum(['disabled', 'add_only', 'add_and_search']).optional(),
	rootFolderId: z.string().optional().nullable(),
	autoAddMonitored: z.boolean().optional(),
	minimumAvailability: z.string().optional(),
	wantsSubtitles: z.boolean().optional(),
	languageProfileId: z.string().optional().nullable(),
	refreshIntervalHours: z.number().min(1).max(168).optional(),
	enabled: z.boolean().optional()
});

export const GET: RequestHandler = async ({ params }) => {
	const service = getSmartListService();
	const list = await service.getSmartList(params.id);

	if (!list) {
		return json({ error: 'Smart list not found' }, { status: 404 });
	}

	return json(list);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const data = updateSchema.parse(body);

		const service = getSmartListService();
		const list = await service.updateSmartList(params.id, data);

		if (!list) {
			return json({ error: 'Smart list not found' }, { status: 404 });
		}

		return json(list);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'Validation failed', details: error.issues }, { status: 400 });
		}
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const service = getSmartListService();
	const deleted = await service.deleteSmartList(params.id);

	if (!deleted) {
		return json({ error: 'Smart list not found' }, { status: 404 });
	}

	return json({ success: true });
};
