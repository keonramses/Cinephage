/**
 * Format Registry
 *
 * Merges built-in formats with enabled DB custom formats at runtime.
 * Custom formats participate in live scoring once enabled.
 *
 * Usage:
 *   import { getActiveFormats, invalidateFormatCache } from './registry.js';
 *
 *   // Get all active formats for scoring
 *   const formats = getActiveFormats();
 *
 *   // After custom format CRUD, invalidate so next call rebuilds cache
 *   invalidateFormatCache();
 */

import type { CustomFormat, ConditionType, FormatCondition } from '../types.js';
import { ALL_FORMATS } from './index.js';
import { db } from '$lib/server/db';
import { customFormats } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

let _activeFormats: CustomFormat[] | null = null;

/**
 * Map a database custom format record to a runtime CustomFormat
 */
function mapDbToFormat(row: typeof customFormats.$inferSelect): CustomFormat {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? '',
		category: row.category as CustomFormat['category'],
		tags: row.tags ?? [],
		conditions: (row.conditions ?? []).map(
			(c) => ({ ...c, type: c.type as ConditionType }) as FormatCondition
		)
	};
}

/**
 * Get all active formats: built-in + enabled DB custom formats.
 * Results are cached until invalidated.
 */
export function getActiveFormats(): CustomFormat[] {
	if (_activeFormats !== null) {
		return _activeFormats;
	}

	const dbCustomFormats = db
		.select()
		.from(customFormats)
		.where(eq(customFormats.enabled, true))
		.all();

	const merged = [...ALL_FORMATS, ...dbCustomFormats.map(mapDbToFormat)];

	_activeFormats = merged;
	return merged;
}

/**
 * Invalidate the format cache.
 * Call this after custom format create, update, or delete.
 */
export function invalidateFormatCache(): void {
	_activeFormats = null;
}
