/**
 * Activity SSE Event Types
 *
 * Shared types for the /api/activity/stream endpoint
 */

import type { UnifiedActivity } from '$lib/types/activity';

/**
 * activity:new event - New activity item
 */
export type ActivityNewEvent = UnifiedActivity;

/**
 * activity:updated event - Activity item updated
 */
export type ActivityUpdatedEvent = UnifiedActivity;

/**
 * activity:progress event - Progress update
 */
export interface ActivityProgressEvent {
	id: string;
	progress: number;
	status: string;
}

/**
 * All events for the activity stream endpoint
 */
export interface ActivityStreamEvents {
	'activity:new': ActivityNewEvent;
	'activity:updated': ActivityUpdatedEvent;
	'activity:progress': ActivityProgressEvent;
}
