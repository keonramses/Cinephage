/**
 * GET /api/usenet/servers - List all NNTP servers
 * POST /api/usenet/servers - Create a new NNTP server
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNntpServerService } from '$lib/server/streaming/nzb/NntpServerService';
import { getNntpManager } from '$lib/server/streaming/usenet/NntpManager';
import { nntpServerCreateSchema } from '$lib/validation/schemas';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * GET /api/usenet/servers
 * List all configured NNTP servers.
 * Passwords are redacted for security.
 */
export const GET: RequestHandler = async () => {
	const service = getNntpServerService();
	const servers = await service.getServers();
	return json(servers);
};

/**
 * POST /api/usenet/servers
 * Create a new NNTP server.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = nntpServerCreateSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const service = getNntpServerService();

	try {
		const created = await service.createServer(result.data);
		await getNntpManager().reload();
		return json({ success: true, server: created });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
