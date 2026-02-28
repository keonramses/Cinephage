/**
 * Bulk .strm File URL Update Endpoint
 *
 * Updates all existing .strm files with a new base URL.
 * Useful when the server's IP, port, or domain changes.
 *
 * POST /api/streaming/strm/update
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { strmService, getStreamingBaseUrl } from '$lib/server/streaming';
import { getBaseUrl } from '$lib/server/streaming/url';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'StrmUpdateAPI' });

export const POST: RequestHandler = async ({ request, locals }) => {
	// Require authentication
	if (!locals.user) {
		return json(
			{
				success: false,
				totalFiles: 0,
				updatedFiles: 0,
				errors: [{ path: 'global', error: 'Authentication required' }]
			},
			{ status: 401 }
		);
	}

	try {
		// Parse request body
		let customBaseUrl: string | undefined;
		let apiKey: string | undefined;
		try {
			const body = await request.json();
			if (body.baseUrl && typeof body.baseUrl === 'string') {
				customBaseUrl = body.baseUrl;
			}
			if (body.apiKey && typeof body.apiKey === 'string') {
				apiKey = body.apiKey;
			}
		} catch {
			// No body or invalid JSON - that's fine, we'll use defaults
		}

		// Determine the base URL to use
		// Priority: request body > indexer settings > PUBLIC_BASE_URL > request headers
		let baseUrl: string;
		if (customBaseUrl) {
			baseUrl = customBaseUrl;
		} else {
			// Use getStreamingBaseUrl which checks indexer settings first
			// Pass the request-derived URL as the final fallback
			const requestBaseUrl = getBaseUrl(request);
			baseUrl = await getStreamingBaseUrl(requestBaseUrl);
		}

		logger.info('[StrmUpdateAPI] Starting bulk .strm update', { baseUrl, hasApiKey: !!apiKey });

		// Perform the bulk update with API key if provided
		const result = await strmService.bulkUpdateStrmUrls(baseUrl, apiKey ? { apiKey } : undefined);

		logger.info('[StrmUpdateAPI] Bulk update complete', {
			success: result.success,
			totalFiles: result.totalFiles,
			updatedFiles: result.updatedFiles,
			errors: result.errors.length
		});

		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error('[StrmUpdateAPI] Bulk update failed', { error: message });

		return json(
			{
				success: false,
				totalFiles: 0,
				updatedFiles: 0,
				errors: [{ path: 'global', error: message }]
			},
			{ status: 500 }
		);
	}
};
