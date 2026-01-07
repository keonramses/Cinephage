/**
 * Channel Categories API
 *
 * GET /api/livetv/channel-categories - Get all user categories
 * POST /api/livetv/channel-categories - Create a new category
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelCategoryService } from '$lib/server/livetv/categories';
import { ValidationError } from '$lib/errors';
import type { ChannelCategoryFormData } from '$lib/types/livetv';

export const GET: RequestHandler = async () => {
	try {
		const categories = await channelCategoryService.getCategories();
		const channelCounts = await channelCategoryService.getCategoryChannelCounts();

		// Enrich categories with channel counts
		const enriched = categories.map((cat) => ({
			...cat,
			channelCount: channelCounts.get(cat.id) || 0
		}));

		return json({
			categories: enriched,
			total: categories.length
		});
	} catch (error) {
		console.error('[API] Failed to get channel categories:', error);
		return json({ error: 'Failed to get channel categories' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as ChannelCategoryFormData;

		if (!body.name || typeof body.name !== 'string') {
			throw new ValidationError('name is required');
		}

		const category = await channelCategoryService.createCategory({
			name: body.name.trim(),
			color: body.color,
			icon: body.icon
		});

		return json(category, { status: 201 });
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[API] Failed to create channel category:', error);
		return json({ error: 'Failed to create channel category' }, { status: 500 });
	}
};
