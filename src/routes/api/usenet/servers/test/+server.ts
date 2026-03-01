/**
 * POST /api/usenet/servers/test - Test NNTP connection without saving
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nntpServerTestSchema } from '$lib/validation/schemas';
import { testNntpConnection } from '$lib/server/streaming/nzb/NntpTestUtils';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

/**
 * POST /api/usenet/servers/test
 * Test NNTP connection with provided credentials (without saving).
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

	const result = nntpServerTestSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const { host, port, useSsl, username, password } = result.data;

	logger.info('[NNTP Test] Testing connection', { host, port, useSsl });

	const testResult = await testNntpConnection(host, port, useSsl ?? true, username, password);

	if (testResult.success) {
		logger.info('[NNTP Test] Connection successful', { host, greeting: testResult.greeting });
		return json({
			success: true,
			greeting: testResult.greeting
		});
	} else {
		logger.warn('[NNTP Test] Connection failed', { host, error: testResult.error });
		return json(
			{
				success: false,
				error: testResult.error
			},
			{ status: 400 }
		);
	}
};
