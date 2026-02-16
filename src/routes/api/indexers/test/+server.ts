import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import { indexerTestSchema } from '$lib/validation/schemas';

export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = indexerTestSchema.safeParse(data);

	if (!result.success) {
		return json(
			{
				success: false,
				error: 'Validation failed',
				details: result.error.flatten()
			},
			{ status: 400 }
		);
	}

	const validated = result.data;

	const manager = await getIndexerManager();

	// Verify the definition exists
	const definition = manager.getDefinition(validated.definitionId);
	if (!definition) {
		return json(
			{
				success: false,
				error: `Unknown indexer definition: ${validated.definitionId}`
			},
			{ status: 400 }
		);
	}

	try {
		// Get protocol from YAML definition
		const protocol = definition.protocol;

		await manager.testIndexer({
			name: validated.name,
			definitionId: validated.definitionId,
			baseUrl: validated.baseUrl,
			alternateUrls: validated.alternateUrls,
			enabled: true,
			priority: 25,
			protocol,
			settings: (validated.settings ?? {}) as Record<string, string>,

			// Default values for test (not needed for connectivity test)
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			minimumSeeders: 1,
			seedRatio: null,
			seedTime: null,
			packSeedTime: null
		});

		return json({ success: true });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ success: false, error: message }, { status: 400 });
	}
};
