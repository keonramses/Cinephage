/**
 * GET /api/streaming/usenet/[mountId]/check
 *
 * Check if a mount's content can be streamed directly or requires extraction.
 * This fetches RAR headers to detect compression without starting a full stream.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { logger } from '$lib/logging';
import { getUsenetStreamService } from '$lib/server/streaming/usenet';
import { getNzbMountManager } from '$lib/server/streaming/nzb/NzbMountManager';

export const GET: RequestHandler = async ({ params }) => {
	const { mountId } = params;

	const streamService = getUsenetStreamService();
	const mountManager = getNzbMountManager();

	// Check if service is ready
	if (!streamService.isReady()) {
		logger.warn('[UsenetCheck] Usenet streaming service not ready');
		return json({ error: 'Usenet streaming service not available' }, { status: 503 });
	}

	try {
		// Check streamability
		const streamability = await streamService.checkStreamability(mountId);

		// Update mount with streamability info
		if (streamability.requiresExtraction) {
			await mountManager.updateStatus(mountId, 'requires_extraction', { streamability });
		} else if (streamability.canStream) {
			await mountManager.updateStatus(mountId, 'ready', { streamability });
		} else {
			await mountManager.updateStatus(mountId, 'error', {
				streamability,
				errorMessage: streamability.error
			});
		}

		logger.info('[UsenetCheck] Checked streamability', {
			mountId,
			canStream: streamability.canStream,
			requiresExtraction: streamability.requiresExtraction,
			archiveType: streamability.archiveType
		});

		return json(streamability);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';

		if (message.includes('not found')) {
			logger.warn('[UsenetCheck] Mount not found', { mountId });
			return json({ error: 'Mount not found' }, { status: 404 });
		}

		logger.error('[UsenetCheck] Check error', { mountId, error: message });
		return json({ error: message }, { status: 500 });
	}
};
