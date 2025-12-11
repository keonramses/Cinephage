import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '$lib/server/indexers/types';
import { indexerUpdateSchema } from '$lib/validation/schemas';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'IndexerAPI' });

export const GET: RequestHandler = async ({ params }) => {
	const manager = await getIndexerManager();
	const indexer = await manager.getIndexer(params.id);

	if (!indexer) {
		return json({ error: 'Indexer not found' }, { status: 404 });
	}

	return json(indexer);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const manager = await getIndexerManager();

	try {
		await manager.deleteIndexer(params.id);
		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = indexerUpdateSchema.safeParse(data);

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
	const manager = await getIndexerManager();

	// Get existing indexer to compare settings (for detecting baseUrl changes)
	const existingIndexer = await manager.getIndexer(params.id);
	if (!existingIndexer) {
		return json({ error: 'Indexer not found' }, { status: 404 });
	}

	// Check if this is the streaming indexer and capture old baseUrl
	const isStreamingIndexer = existingIndexer.definitionId === CINEPHAGE_STREAM_DEFINITION_ID;
	const oldBaseUrl =
		typeof existingIndexer.settings?.baseUrl === 'string'
			? existingIndexer.settings.baseUrl
			: undefined;
	const newBaseUrl =
		typeof validated.settings?.baseUrl === 'string' ? validated.settings.baseUrl : undefined;

	try {
		const updated = await manager.updateIndexer(params.id, {
			name: validated.name,
			enabled: validated.enabled,
			baseUrl: validated.baseUrl,
			alternateUrls: validated.alternateUrls,
			priority: validated.priority,
			settings: validated.settings as Record<string, string> | undefined,

			// Search capability toggles
			enableAutomaticSearch: validated.enableAutomaticSearch,
			enableInteractiveSearch: validated.enableInteractiveSearch,

			// Torrent seeding settings
			minimumSeeders: validated.minimumSeeders,
			seedRatio: validated.seedRatio,
			seedTime: validated.seedTime,
			packSeedTime: validated.packSeedTime,
			preferMagnetUrl: validated.preferMagnetUrl
		});

		// If streaming indexer's baseUrl changed, trigger bulk .strm file update
		if (isStreamingIndexer && newBaseUrl && oldBaseUrl !== newBaseUrl) {
			logger.info('[IndexerAPI] Streaming baseUrl changed, triggering .strm file update', {
				oldBaseUrl,
				newBaseUrl
			});

			// Run in background to not block the response
			import('$lib/server/streaming')
				.then(async ({ strmService, getStreamingBaseUrl }) => {
					const baseUrl = await getStreamingBaseUrl(newBaseUrl);
					const result = await strmService.bulkUpdateStrmUrls(baseUrl);
					logger.info('[IndexerAPI] Background .strm update complete', {
						totalFiles: result.totalFiles,
						updatedFiles: result.updatedFiles,
						errors: result.errors.length
					});
				})
				.catch((err) => {
					logger.error('[IndexerAPI] Failed to update .strm files after baseUrl change', {
						error: err instanceof Error ? err.message : 'Unknown error'
					});
				});
		}

		return json({ success: true, indexer: updated });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (message.includes('not found')) {
			return json({ error: message }, { status: 404 });
		}
		return json({ error: message }, { status: 500 });
	}
};
