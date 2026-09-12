/**
 * Series-specific helper for building Sonarr-compatible resources.
 * Image/slug/title helpers are shared with movies via movieShape.ts.
 */

/** SeriesStatusType enum: continuing | ended | upcoming | deleted. */
export function deriveSeriesStatus(status: string | null): string {
	switch (status) {
		case 'Continuing':
			return 'continuing';
		case 'Ended':
			return 'ended';
		case 'Upcoming':
			return 'upcoming';
		default:
			return 'continuing';
	}
}
