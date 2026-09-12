/**
 * Radarr/Sonarr-compatible `languageprofile` response (Sonarr-only - Radarr's
 * v3 API has no language profile concept).
 *
 * Field set confirmed against LanguageProfileResource in Sonarr's actual
 * openapi.json. Backed by Cinephage's real `language_profiles` table (the
 * same one behind Settings > Language Profiles) - each row's `languages`
 * array (an ordered list of subtitle language preferences with a
 * `cutoffIndex`) maps directly onto `LanguageProfileItemResource[]` +
 * `cutoff`.
 *
 * Semantic note: Cinephage's language profiles configure *subtitle*
 * language preferences, not an audio/dub language like Sonarr's own
 * feature - conceptually different, but the response shape (a named,
 * ordered list of languages with a cutoff and an upgrade toggle) maps
 * cleanly enough onto LanguageProfileResource that reporting the real
 * profiles here is far more honest than an empty skeleton or a fabricated
 * single "Default" entry.
 */

import { db } from '$lib/server/db/index.js';
import { languageProfiles } from '$lib/server/db/schema.js';
import { getLanguageName } from '$lib/shared/languages.js';
import { getOrAssignArrId, getOrAssignArrIds } from './ArrIdMappingService.js';

interface LanguageResource {
	id: number;
	name: string;
}

export interface LanguageProfileResource {
	id: number;
	name: string;
	upgradeAllowed: boolean;
	cutoff: LanguageResource;
	languages: Array<{ id: number; language: LanguageResource; allowed: boolean }>;
}

export async function buildLanguageProfiles(): Promise<LanguageProfileResource[]> {
	const rows = await db.select().from(languageProfiles);

	// Every profile's language codes, deduplicated, so surrogate IDs are
	// assigned in one batched round trip rather than per-row.
	const allCodes = [...new Set(rows.flatMap((row) => row.languages.map((pref) => pref.code)))];
	const codeArrIds = await getOrAssignArrIds('language', allCodes);

	const toLanguageResource = (code: string): LanguageResource => ({
		id: codeArrIds.get(code) ?? 0,
		name: getLanguageName(code)
	});

	return Promise.all(
		rows.map(async (row) => {
			const cutoffPref = row.languages[row.cutoffIndex ?? 0] ?? row.languages[0];
			return {
				id: await getOrAssignArrId('languageProfile', row.id),
				name: row.name,
				// Real field is non-nullable; Cinephage's column defaults true.
				upgradeAllowed: row.upgradesAllowed ?? true,
				cutoff: cutoffPref ? toLanguageResource(cutoffPref.code) : { id: 0, name: 'Unknown' },
				languages: row.languages.map((pref) => ({
					id: codeArrIds.get(pref.code) ?? 0,
					language: toLanguageResource(pref.code),
					allowed: true
				}))
			};
		})
	);
}
