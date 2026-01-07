import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	mediaBrowserServerCreateSchema,
	mediaBrowserServerUpdateSchema
} from '$lib/validation/schemas';
import { getMediaBrowserManager } from '$lib/server/notifications/mediabrowser';

export const load: PageServerLoad = async () => {
	const manager = getMediaBrowserManager();
	const servers = await manager.getServers();

	return {
		servers
	};
};

export const actions: Actions = {
	createServer: async ({ request }) => {
		const data = await request.formData();
		const jsonData = data.get('data');

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { serverError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { serverError: 'Invalid JSON data' });
		}

		const result = mediaBrowserServerCreateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				serverError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = getMediaBrowserManager();

		try {
			await manager.createServer(result.data);
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	updateServer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const jsonData = data.get('data');

		if (!id || typeof id !== 'string') {
			return fail(400, { serverError: 'Missing server ID' });
		}

		if (!jsonData || typeof jsonData !== 'string') {
			return fail(400, { serverError: 'Invalid request data' });
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonData);
		} catch {
			return fail(400, { serverError: 'Invalid JSON data' });
		}

		const result = mediaBrowserServerUpdateSchema.safeParse(parsed);
		if (!result.success) {
			return fail(400, {
				serverError: result.error.issues[0]?.message ?? 'Validation failed'
			});
		}

		const manager = getMediaBrowserManager();

		try {
			await manager.updateServer(id, result.data);
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	deleteServer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { serverError: 'Missing server ID' });
		}

		const manager = getMediaBrowserManager();

		try {
			await manager.deleteServer(id);
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	},

	toggleServer: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const enabled = data.get('enabled') === 'true';

		if (!id || typeof id !== 'string') {
			return fail(400, { serverError: 'Missing server ID' });
		}

		const manager = getMediaBrowserManager();

		try {
			await manager.updateServer(id, { enabled });
			return { serverSuccess: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return fail(500, { serverError: message });
		}
	}
};
