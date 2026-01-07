/**
 * Bulk Set Category API
 *
 * POST /api/livetv/lineup/bulk-category - Set category for multiple lineup items
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { channelLineupService } from '$lib/server/livetv/lineup';
import { ValidationError } from '$lib/errors';

interface BulkSetCategoryRequest {
	itemIds: string[];
	categoryId: string | null;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as BulkSetCategoryRequest;

		if (!body.itemIds || !Array.isArray(body.itemIds)) {
			throw new ValidationError('itemIds array is required');
		}

		if (body.itemIds.length === 0) {
			return json({ updated: 0 });
		}

		// categoryId can be null (for uncategorized) or a string
		const categoryId = body.categoryId === undefined ? null : body.categoryId;

		const updated = await channelLineupService.bulkSetCategory(body.itemIds, categoryId);

		return json({ updated });
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		console.error('[API] Failed to bulk set category:', error);
		return json({ error: 'Failed to update categories' }, { status: 500 });
	}
};
