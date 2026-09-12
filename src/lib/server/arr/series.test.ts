import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb, type TestDatabase } from '../../../test/db-helper.js';
import {
	series,
	seasons,
	episodes,
	episodeFiles,
	alternateTitles,
	rootFolders,
	scoringProfiles
} from '$lib/server/db/schema.js';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/tmdb.js', () => ({
	tmdb: {
		searchTv: vi.fn(),
		getTVShow: vi.fn()
	}
}));

const { buildSeries, buildSeriesByArrId } = await import('./series.js');
const { buildEpisodesForSeries } = await import('./episodes.js');

const SERIES_ID = 'series-1';
const ROOT_FOLDER_ID = 'root-1';
const PROFILE_ID = 'profile-1';

beforeEach(() => {
	testDb.db.delete(episodeFiles).run();
	testDb.db.delete(episodes).run();
	testDb.db.delete(seasons).run();
	testDb.db.delete(alternateTitles).run();
	testDb.db.delete(series).run();
	testDb.db.delete(rootFolders).run();
	testDb.db.delete(scoringProfiles).run();

	testDb.db
		.insert(rootFolders)
		.values({ id: ROOT_FOLDER_ID, name: 'TV', path: '/tv', mediaType: 'tv' })
		.run();
	testDb.db.insert(scoringProfiles).values({ id: PROFILE_ID, name: 'HD' }).run();
});

describe('buildSeries', () => {
	it('maps a series with a season and episodes to the expected shape', async () => {
		testDb.db
			.insert(series)
			.values({
				id: SERIES_ID,
				tmdbId: 200,
				title: 'Some Show',
				path: '/tv/some-show',
				rootFolderId: ROOT_FOLDER_ID,
				scoringProfileId: PROFILE_ID,
				status: 'Continuing',
				monitored: true,
				year: 2023
			})
			.run();
		testDb.db
			.insert(seasons)
			.values({ id: 'season-1', seriesId: SERIES_ID, seasonNumber: 1, monitored: true })
			.run();
		testDb.db
			.insert(episodes)
			.values([
				{
					id: 'ep-1',
					seriesId: SERIES_ID,
					seasonNumber: 1,
					episodeNumber: 1,
					title: 'Pilot',
					hasFile: true
				},
				{
					id: 'ep-2',
					seriesId: SERIES_ID,
					seasonNumber: 1,
					episodeNumber: 2,
					title: 'Episode Two',
					hasFile: false
				}
			])
			.run();
		testDb.db
			.insert(episodeFiles)
			.values({
				id: 'file-1',
				seriesId: SERIES_ID,
				seasonNumber: 1,
				episodeIds: ['ep-1'],
				relativePath: 'S01E01.mkv',
				size: 1_000_000_000,
				releaseGroup: 'GROUP'
			})
			.run();

		const [show] = await buildSeries();
		expect(show.title).toBe('Some Show');
		expect(show.status).toBe('continuing');
		expect(show.rootFolderPath).toBe('/tv');
		expect(Number.isInteger(show.id)).toBe(true);

		const seasonList = show.seasons as Array<{
			seasonNumber: number;
			statistics: { episodeCount: number; episodeFileCount: number; sizeOnDisk: number };
		}>;
		expect(seasonList).toHaveLength(1);
		expect(seasonList[0].statistics.episodeCount).toBe(2);
		expect(seasonList[0].statistics.episodeFileCount).toBe(1);
		expect(seasonList[0].statistics.sizeOnDisk).toBe(1_000_000_000);
	});

	it('buildSeriesByArrId finds the same record buildSeries returns', async () => {
		testDb.db
			.insert(series)
			.values({ id: SERIES_ID, tmdbId: 201, title: 'Lookup Show', path: '/tv/lookup-show' })
			.run();

		const [show] = await buildSeries();
		const found = await buildSeriesByArrId(show.id as number);
		expect(found).toEqual(show);
	});
});

describe('buildEpisodesForSeries', () => {
	it('resolves episodeFile from an episodeIds-linked file row', async () => {
		testDb.db
			.insert(series)
			.values({ id: SERIES_ID, tmdbId: 202, title: 'Episode Test', path: '/tv/episode-test' })
			.run();
		testDb.db
			.insert(episodes)
			.values({
				id: 'ep-3',
				seriesId: SERIES_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'Ep',
				hasFile: true
			})
			.run();
		testDb.db
			.insert(episodeFiles)
			.values({
				id: 'file-2',
				seriesId: SERIES_ID,
				seasonNumber: 1,
				episodeIds: ['ep-3'],
				relativePath: 'S01E01.mkv',
				size: 500
			})
			.run();

		const [episode] = await buildEpisodesForSeries({ seriesId: SERIES_ID });
		expect(episode.hasFile).toBe(true);
		expect(episode.episodeFile).toBeDefined();
		expect((episode.episodeFile as { size: number }).size).toBe(500);
	});

	it('filters by seasonNumber when provided', async () => {
		testDb.db
			.insert(series)
			.values({ id: SERIES_ID, tmdbId: 203, title: 'Multi Season', path: '/tv/multi' })
			.run();
		testDb.db
			.insert(episodes)
			.values([
				{ id: 'ep-s1', seriesId: SERIES_ID, seasonNumber: 1, episodeNumber: 1 },
				{ id: 'ep-s2', seriesId: SERIES_ID, seasonNumber: 2, episodeNumber: 1 }
			])
			.run();

		const season1Episodes = await buildEpisodesForSeries({ seriesId: SERIES_ID, seasonNumber: 1 });
		expect(season1Episodes).toHaveLength(1);
		expect(season1Episodes[0].seasonNumber).toBe(1);
	});
});
