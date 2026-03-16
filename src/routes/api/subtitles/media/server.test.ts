import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTestDb, closeTestDb, getTestDb } from '../../../../test/db-helper';
import { movies, episodes, rootFolders, series, subtitles } from '$lib/server/db/schema';

const mockLogger = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis()
}));

initTestDb();

vi.mock('$lib/server/db', () => {
	return {
		get db() {
			return getTestDb().db;
		},
		get sqlite() {
			return getTestDb().sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

const { GET } = await import('./+server');

describe('Subtitle Media API', () => {
	beforeAll(() => {
		initTestDb();
	});

	afterAll(() => {
		closeTestDb();
	});

	beforeEach(async () => {
		initTestDb();
		const { db } = getTestDb();
		db.delete(subtitles).run();
		db.delete(episodes).run();
		db.delete(series).run();
		db.delete(movies).run();
		db.delete(rootFolders).run();
	});

	it('returns sync metadata for movie subtitles', async () => {
		const { db } = getTestDb();
		await db.insert(rootFolders).values({
			id: 'root-1',
			name: 'Movies',
			path: '/tmp/movies',
			mediaType: 'movie'
		});
		await db.insert(movies).values({
			id: 'movie-1',
			tmdbId: 101,
			title: 'Movie',
			path: 'Movie',
			rootFolderId: 'root-1'
		});
		await db.insert(subtitles).values({
			id: 'subtitle-1',
			movieId: 'movie-1',
			relativePath: 'Movie.en.srt',
			language: 'en',
			format: 'srt',
			wasSynced: true,
			syncOffset: 1500
		});

		const response = await GET({
			url: new URL('http://localhost/api/subtitles/media?movieId=movie-1')
		} as Parameters<typeof GET>[0]);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.subtitles).toHaveLength(1);
		expect(payload.subtitles[0].wasSynced).toBe(true);
		expect(payload.subtitles[0].syncOffset).toBe(1500);
	});
});
