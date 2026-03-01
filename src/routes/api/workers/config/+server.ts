/**
 * Worker Config API - Get and update worker configuration
 *
 * GET /api/workers/config - Get current configuration
 * PUT /api/workers/config - Update configuration
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { workerManager, type WorkerManagerConfig, type WorkerType } from '$lib/server/workers';
import { requireAdmin } from '$lib/server/auth/authorization.js';

export const GET: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	return json(workerManager.getConfig());
};

export const PUT: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	try {
		const body = await request.json();
		const updates: Partial<WorkerManagerConfig> = {};

		// Validate and extract maxConcurrent updates
		if (body.maxConcurrent && typeof body.maxConcurrent === 'object') {
			const validTypes: WorkerType[] = ['stream', 'import', 'scan', 'monitoring'];
			const maxConcurrent: Partial<Record<WorkerType, number>> = {};

			for (const type of validTypes) {
				if (typeof body.maxConcurrent[type] === 'number') {
					const value = body.maxConcurrent[type];
					if (value < 0 || value > 100) {
						throw error(400, {
							message: `Invalid maxConcurrent.${type}: must be between 0 and 100`
						});
					}
					maxConcurrent[type] = value;
				}
			}

			if (Object.keys(maxConcurrent).length > 0) {
				updates.maxConcurrent = {
					...workerManager.getConfig().maxConcurrent,
					...maxConcurrent
				};
			}
		}

		// Validate cleanupAfterMs
		if (typeof body.cleanupAfterMs === 'number') {
			if (body.cleanupAfterMs < 0) {
				throw error(400, { message: 'cleanupAfterMs must be non-negative' });
			}
			updates.cleanupAfterMs = body.cleanupAfterMs;
		}

		// Validate maxLogsPerWorker
		if (typeof body.maxLogsPerWorker === 'number') {
			if (body.maxLogsPerWorker < 10 || body.maxLogsPerWorker > 10000) {
				throw error(400, { message: 'maxLogsPerWorker must be between 10 and 10000' });
			}
			updates.maxLogsPerWorker = body.maxLogsPerWorker;
		}

		// Apply updates
		workerManager.updateConfig(updates);

		return json({
			success: true,
			config: workerManager.getConfig()
		});
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) {
			throw e;
		}
		throw error(400, { message: 'Invalid request body' });
	}
};
