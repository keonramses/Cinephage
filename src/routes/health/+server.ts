/**
 * Health check endpoint.
 * Returns service health status for monitoring and load balancers.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';
import { resolveAppVersion } from '$lib/version.js';

export const GET: RequestHandler = async () => {
	const checks: Record<string, { status: 'healthy' | 'unhealthy'; latencyMs?: number }> = {};
	let overallHealthy = true;

	// Database check
	const dbStart = performance.now();
	try {
		await db.select().from(settings).limit(1);
		checks.database = {
			status: 'healthy',
			latencyMs: Math.round(performance.now() - dbStart)
		};
	} catch {
		checks.database = { status: 'unhealthy' };
		overallHealthy = false;
	}

	return json(
		{
			status: overallHealthy ? 'healthy' : 'unhealthy',
			version: resolveAppVersion(),
			uptime: Math.round(process.uptime()),
			timestamp: new Date().toISOString(),
			checks
		},
		{ status: overallHealthy ? 200 : 503 }
	);
};
