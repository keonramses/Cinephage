import type { RequestHandler } from './$types';
import { emptyListSkeleton } from '$lib/server/arr/skeleton.js';

/**
 * GET /api/sonarr/api/v3/notification
 * Skeleton - Cinephage has no Radarr/Sonarr-style notification-connection concept.
 */
export const GET: RequestHandler = emptyListSkeleton;
