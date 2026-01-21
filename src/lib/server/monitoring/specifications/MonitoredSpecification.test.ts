/**
 * MonitoredSpecification Unit Tests
 *
 * Tests for the cascading monitoring logic:
 * - Episode is monitored if series.monitored AND season.monitored AND episode.monitored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	MovieMonitoredSpecification,
	EpisodeMonitoredSpecification
} from './MonitoredSpecification.js';
import type { MovieContext, EpisodeContext } from './types.js';
import { RejectionReason } from './types.js';

// Mock database
vi.mock('$lib/server/db/index.js', () => ({
	db: {
		query: {
			seasons: {
				findFirst: vi.fn()
			}
		}
	}
}));

import { db } from '$lib/server/db/index.js';

describe('MovieMonitoredSpecification', () => {
	it('should accept monitored movie', async () => {
		const spec = new MovieMonitoredSpecification();
		const context: MovieContext = {
			movie: { monitored: true } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should reject unmonitored movie', async () => {
		const spec = new MovieMonitoredSpecification();
		const context: MovieContext = {
			movie: { monitored: false } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.NOT_MONITORED);
	});
});

describe('EpisodeMonitoredSpecification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should reject episode when series is not monitored', async () => {
		const spec = new EpisodeMonitoredSpecification();
		const context: EpisodeContext = {
			series: { monitored: false } as any,
			episode: { monitored: true, seasonId: 'season-1' } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.SERIES_NOT_MONITORED);
	});

	it('should reject episode when episode itself is not monitored', async () => {
		const spec = new EpisodeMonitoredSpecification();
		const context: EpisodeContext = {
			series: { monitored: true } as any,
			episode: { monitored: false, seasonId: 'season-1' } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.NOT_MONITORED);
	});

	it('should reject episode when season is not monitored', async () => {
		const spec = new EpisodeMonitoredSpecification();
		const context: EpisodeContext = {
			series: { monitored: true } as any,
			episode: { monitored: true, seasonId: 'season-1' } as any
		};

		// Mock the season query to return unmonitored season
		vi.mocked(db.query.seasons.findFirst).mockResolvedValue({
			monitored: false
		} as any);

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.SEASON_NOT_MONITORED);
	});

	it('should accept episode when all levels are monitored', async () => {
		const spec = new EpisodeMonitoredSpecification();
		const context: EpisodeContext = {
			series: { monitored: true } as any,
			episode: { monitored: true, seasonId: 'season-1' } as any
		};

		// Mock the season query to return monitored season
		vi.mocked(db.query.seasons.findFirst).mockResolvedValue({
			monitored: true
		} as any);

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should accept episode when seasonId is missing (defaults to monitored)', async () => {
		const spec = new EpisodeMonitoredSpecification();
		const context: EpisodeContext = {
			series: { monitored: true } as any,
			episode: { monitored: true, seasonId: null } as any
		};

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	it('should accept episode when season is not found in database (defaults to monitored)', async () => {
		const spec = new EpisodeMonitoredSpecification();
		const context: EpisodeContext = {
			series: { monitored: true } as any,
			episode: { monitored: true, seasonId: 'season-1' } as any
		};

		// Mock the season query to return null (season not found)
		vi.mocked(db.query.seasons.findFirst).mockResolvedValue(null);

		const result = await spec.isSatisfied(context);

		expect(result.accepted).toBe(true);
	});

	/**
	 * This test validates the bug fix for:
	 * [Bug]: Episode Monitoring Auto download still triggered when series monitor is disabled
	 *
	 * When series monitoring is disabled, episodes should NOT be auto-downloaded,
	 * even if the episode itself has monitoring enabled.
	 */
	it('should reject monitored episode when parent series is unmonitored (bug fix validation)', async () => {
		const spec = new EpisodeMonitoredSpecification();

		// Setup: Series is unmonitored, but episode is monitored
		const context: EpisodeContext = {
			series: { monitored: false } as any, // ← Series monitoring is OFF
			episode: { monitored: true, seasonId: 'season-1' } as any // ← Episode monitoring is ON
		};

		const result = await spec.isSatisfied(context);

		// Expected: Episode should be REJECTED because series is not monitored
		expect(result.accepted).toBe(false);
		expect(result.reason).toBe(RejectionReason.SERIES_NOT_MONITORED);
	});
});
