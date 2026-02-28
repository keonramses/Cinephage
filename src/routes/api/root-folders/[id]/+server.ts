import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRootFolderService } from '$lib/server/downloadClients/RootFolderService';
import { rootFolderUpdateSchema } from '$lib/validation/schemas';
import { assertFound, parseBody } from '$lib/server/api/validate';
import { NotFoundError, isAppError } from '$lib/errors';

/**
 * GET /api/root-folders/[id]
 * Get a single root folder with current free space.
 */
export const GET: RequestHandler = async ({ params }) => {
	const service = getRootFolderService();
	const folder = await service.getFolder(params.id);

	return json(assertFound(folder, 'Root folder', params.id));
};

/**
 * PUT /api/root-folders/[id]
 * Update a root folder.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await parseBody(request, rootFolderUpdateSchema);
	const service = getRootFolderService();

	try {
		const updated = await service.updateFolder(params.id, data);
		return json({ success: true, folder: updated });
	} catch (error) {
		if (isAppError(error)) {
			return json(error.toJSON(), { status: error.statusCode });
		}
		if (error instanceof Error && error.message.includes('not found')) {
			throw new NotFoundError('Root folder', params.id);
		}
		throw error;
	}
};

/**
 * DELETE /api/root-folders/[id]
 * Delete a root folder.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const service = getRootFolderService();

	try {
		await service.deleteFolder(params.id);
		return json({ success: true });
	} catch (error) {
		if (error instanceof Error && error.message.includes('not found')) {
			throw new NotFoundError('Root folder', params.id);
		}
		throw error;
	}
};
