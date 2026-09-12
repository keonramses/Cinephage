/**
 * Toggle for the Radarr/Sonarr-compatible API layer. Off by default.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/db/schema';

export const ARR_COMPAT_ENABLED_KEY = 'arr_compat_enabled';

export function isArrCompatEnabled(): boolean {
	const row = db.select().from(settings).where(eq(settings.key, ARR_COMPAT_ENABLED_KEY)).get();
	return row?.value === 'true';
}

export function setArrCompatEnabled(value: boolean): void {
	const stored = value ? 'true' : 'false';
	db.insert(settings)
		.values({ key: ARR_COMPAT_ENABLED_KEY, value: stored })
		.onConflictDoUpdate({ target: settings.key, set: { value: stored } })
		.run();
}
