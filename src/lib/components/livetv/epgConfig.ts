/**
 * EPG Grid responsive configuration
 * Provides viewport-aware sizing for the EPG guide grid
 */

export interface EpgGridConfig {
	channelWidth: number;
	hourWidth: number;
	rowHeight: number;
	slotMinutes: number;
}

/**
 * EPG breakpoint configurations for different viewport sizes
 * Values are in pixels
 */
export const EPG_BREAKPOINTS = {
	// Mobile portrait (360px minimum)
	xs: {
		channelWidth: 100,
		hourWidth: 180,
		rowHeight: 56,
		slotMinutes: 30
	},
	// Mobile landscape / small tablet (480px+)
	sm: {
		channelWidth: 120,
		hourWidth: 240,
		rowHeight: 60,
		slotMinutes: 30
	},
	// Tablet (768px+)
	md: {
		channelWidth: 150,
		hourWidth: 320,
		rowHeight: 64,
		slotMinutes: 30
	},
	// Desktop (1024px+)
	lg: {
		channelWidth: 180,
		hourWidth: 400,
		rowHeight: 64,
		slotMinutes: 30
	}
} as const;

/**
 * Get the appropriate EPG configuration based on viewport width
 */
export function getEpgConfig(viewportWidth: number): EpgGridConfig {
	if (viewportWidth < 480) return EPG_BREAKPOINTS.xs;
	if (viewportWidth < 768) return EPG_BREAKPOINTS.sm;
	if (viewportWidth < 1024) return EPG_BREAKPOINTS.md;
	return EPG_BREAKPOINTS.lg;
}
