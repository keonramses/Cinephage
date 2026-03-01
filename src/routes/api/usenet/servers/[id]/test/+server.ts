/**
 * POST /api/usenet/servers/:id/test - Test NNTP server connection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNntpServerService } from '$lib/server/streaming/nzb/NntpServerService';
import { testNntpConnection } from '$lib/server/streaming/nzb/NntpTestUtils';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/usenet/servers/:id/test
 * Test NNTP server connection using stored credentials.
 */
export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { params } = event;
	const service = getNntpServerService();
	const server = await service.getServerWithPassword(params.id);

	if (!server) {
		return json({ error: 'Server not found' }, { status: 404 });
	}

	logger.info('[NNTP Test] Testing connection', {
		id: server.id,
		host: server.host,
		port: server.port,
		useSsl: server.useSsl
	});

	const result = await testNntpConnection(
		server.host,
		server.port,
		server.useSsl ?? true,
		server.username,
		server.password
	);

	// Update test result in database
	await service.updateTestResult(server.id, result.success ? 'success' : 'failed', result.error);

	if (result.success) {
		logger.info('[NNTP Test] Connection successful', { id: server.id, greeting: result.greeting });
		return json({
			success: true,
			greeting: result.greeting
		});
	} else {
		logger.warn('[NNTP Test] Connection failed', { id: server.id, error: result.error });
		return json(
			{
				success: false,
				error: result.error
			},
			{ status: 400 }
		);
	}
};
