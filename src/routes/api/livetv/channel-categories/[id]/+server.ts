/**
 * Single Channel Category API
 *
 * GET /api/livetv/channel-categories/[id] - Get single category
 * PUT /api/livetv/channel-categories/[id] - Update category
 * DELETE /api/livetv/channel-categories/[id] - Delete category
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelCategoryService } from '$lib/server/livetv/categories';
import { ValidationError } from '$lib/errors';
import type { ChannelCategoryFormData } from '$lib/types/livetv';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const category = await channelCategoryService.getCategoryById(params.id);

		if (!category) {
			return json({ error: 'Category not found' }, { status: 404 });
		}

		return json(category);
	} catch (error) {
		console.error('[API] Failed to get channel category:', error);
		return json({ error: 'Failed to get channel category' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = (await request.json()) as ChannelCategoryFormData;

		if (!body.name || typeof body.name !== 'string') {
			throw new ValidationError('name is required');
		}

		const category = await channelCategoryService.updateCategory(params.id, {
			name: body.name.trim(),
			color: body.color,
			icon: body.icon
		});

		if (!category) {
			return json({ error: 'Category not found' }, { status: 404 });
		}

		return json(category);
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[API] Failed to update channel category:', error);
		return json({ error: 'Failed to update channel category' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const success = await channelCategoryService.deleteCategory(params.id);

		if (!success) {
			return json({ error: 'Category not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('[API] Failed to delete channel category:', error);
		return json({ error: 'Failed to delete channel category' }, { status: 500 });
	}
};
