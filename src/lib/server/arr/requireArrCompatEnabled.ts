/**
 * Guard for every route under /api/radarr/* and /api/sonarr/* - returns 404
 * when the compatibility layer is turned off in Settings > System > General, same
 * as the pattern requireAdmin() uses for authorization.
 *
 * 404 rather than 403: when the feature is off it shouldn't even
 * look like it exists to a probing client
 */

import { json } from '@sveltejs/kit';
import { isArrCompatEnabled } from './arrCompatSettings.js';

export function requireArrCompatEnabled(): Response | null {
	if (!isArrCompatEnabled()) {
		return json({ message: 'Not Found' }, { status: 404 });
	}
	return null;
}
