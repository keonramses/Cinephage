import { json } from '@sveltejs/kit';
import {
	getDefinitionLoader,
	initializeDefinitions,
	toUIDefinition
} from '$lib/server/indexers/loader';

/**
 * GET /api/indexers/definitions
 * Returns all available indexer definitions from the unified YAML-based system.
 * Internal/auto-managed indexers (like streaming) are excluded from this list.
 */
export async function GET() {
	// Ensure definitions are loaded
	const loader = getDefinitionLoader();
	if (!loader.isLoaded()) {
		await initializeDefinitions();
	}

	// Get all definitions and convert to UI format
	const allDefinitions = loader.getAll();

	// Map to API response format, excluding internal indexers
	const definitions = allDefinitions
		.filter((def) => def.protocol !== 'streaming') // Exclude streaming indexers from public list
		.map((def) => {
			const uiDef = toUIDefinition(def);
			return {
				id: uiDef.id,
				name: uiDef.name,
				description: uiDef.description,
				type: uiDef.type,
				protocol: uiDef.protocol,
				siteUrl: uiDef.siteUrl,
				alternateUrls: uiDef.alternateUrls,
				capabilities: uiDef.capabilities,
				settings: uiDef.settings
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	return json(definitions);
}
