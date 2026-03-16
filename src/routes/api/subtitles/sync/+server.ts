import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleSyncService } from '$lib/server/subtitles/services/SubtitleSyncService';
import { subtitleSyncSchema } from '$lib/validation/schemas';

/**
 * POST /api/subtitles/sync
 * Synchronize a subtitle using alass.
 */
export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = subtitleSyncSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;
	const syncService = getSubtitleSyncService();

	try {
		const syncResult = await syncService.syncSubtitle(validated.subtitleId, {
			referenceType: validated.referenceType,
			referencePath: validated.referencePath,
			splitPenalty: validated.splitPenalty,
			noSplits: validated.noSplits
		});

		if (!syncResult.success && syncResult.error?.startsWith('Subtitle not found:')) {
			return json({ error: 'Subtitle not found' }, { status: 404 });
		}

		if (!syncResult.success && syncResult.error === 'Video file not found for syncing') {
			return json({ error: syncResult.error }, { status: 400 });
		}

		return json({
			success: syncResult.success,
			offsetMs: syncResult.offsetMs,
			error: syncResult.error
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};

/**
 * GET /api/subtitles/sync
 * Check if alass is available.
 */
export const GET: RequestHandler = async () => {
	const syncService = getSubtitleSyncService();
	const isAvailable = await syncService.isAvailable();

	return json({
		available: isAvailable,
		message: isAvailable
			? 'alass is available'
			: 'alass is not installed. Install with: cargo install alass-cli (or download from https://github.com/kaegi/alass/releases). Set ALASS_PATH env var to specify a custom binary location.'
	});
};
