import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../../test/db-helper';
import { indexers } from '$lib/server/db/schema';
import { CINEPHAGE_STREAM_DEFINITION_ID } from '../types';

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

vi.mock('$lib/logging', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	},
	createChildLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

const { CinephageBackendClient } = await import('./CinephageBackendClient');
const { sanitizeStreamingIndexerSettings, getStreamingIndexerSettings } =
	await import('$lib/server/streaming/settings');

describe('CinephageBackendClient', () => {
	const originalEnv = { ...process.env };

	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		for (const key of Object.keys(process.env)) {
			delete process.env[key];
		}
		Object.assign(process.env, originalEnv);

		await testDb.db
			.delete(indexers)
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));
		await testDb.db.insert(indexers).values({
			id: 'cinephage-stream-test',
			name: 'Cinephage Library',
			definitionId: CINEPHAGE_STREAM_DEFINITION_ID,
			enabled: true,
			baseUrl: 'http://localhost',
			priority: 50,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			settings: {}
		});
	});

	afterAll(() => {
		for (const key of Object.keys(process.env)) {
			delete process.env[key];
		}
		Object.assign(process.env, originalEnv);
		destroyTestDb(testDb);
	});

	it('sanitizes streaming settings to the supported keys only', () => {
		expect(
			sanitizeStreamingIndexerSettings({
				cinephageCommit: 'def4567890abcdef123456',
				cinephageVersion: '2.0.0',
				useHttps: 'true',
				externalHost: 'example.com:3000',
				cinephageApiBaseUrl: 'https://override.invalid',
				cinephageClientKey: 'legacy-key'
			})
		).toEqual({
			cinephageCommit: 'def4567890abcdef123456',
			cinephageVersion: '2.0.0',
			useHttps: 'true',
			externalHost: 'example.com:3000'
		});
	});

	it('preserves manually entered streaming auth values', () => {
		expect(
			sanitizeStreamingIndexerSettings({
				cinephageCommit: 'abc1234567890abcdef',
				cinephageVersion: '1.0.0'
			})
		).toEqual({
			cinephageCommit: 'abc1234567890abcdef',
			cinephageVersion: '1.0.0'
		});
	});

	it('uses DB settings only and ignores env fallbacks', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		process.env.CINEPHAGE_API_COMMIT = 'env-commit';
		process.env.CINEPHAGE_API_VERSION = 'env-version';

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({ success: true, streams: [] })
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new CinephageBackendClient();
		await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.cinephage.net/api/v1/stream/562?type=movie',
			expect.objectContaining({
				headers: expect.objectContaining({
					'X-Cinephage-Version': '2.0.0',
					'X-Cinephage-Commit': 'def4567890abcdef123456'
				})
			})
		);
	});

	it('reports missing commit and version when DB settings are blank', async () => {
		process.env.CINEPHAGE_API_COMMIT = 'env-commit';
		process.env.CINEPHAGE_API_VERSION = 'env-version';

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(result).toEqual({
			success: false,
			sources: [],
			error:
				'Cinephage backend is not configured: missing cinephageCommit, cinephageVersion. Enter the current published Cinephage API version and commit in the streaming indexer settings.'
		});
	});

	it('maps upstream 401 responses to authentication errors', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401
			})
		);

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(result).toEqual({
			success: false,
			sources: [],
			error:
				'Cinephage backend rejected authentication. Verify the manually entered Cinephage API version and commit match the current published build.'
		});
	});

	it('maps upstream 403 responses to insufficient permissions errors', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 403
			})
		);

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(result).toEqual({
			success: false,
			sources: [],
			error: 'Cinephage API returned forbidden: insufficient permissions'
		});
	});

	it('maps upstream 429 responses and parses limit/resetAt from details', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				json: vi.fn().mockResolvedValue({
					error: {
						message: 'Rate limit exceeded',
						details: {
							limit: 60,
							resetAt: '2026-04-27T05:00:00.000Z'
						}
					}
				})
			})
		);

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(result.success).toBe(false);
		expect(result.error).toContain('Cinephage backend rate limited this request');
		expect(result.error).toContain('limit: 60');
		expect(result.error).toContain('resets at 2026-04-27T05:00:00.000Z');
	});

	it('maps upstream 502 responses to no-streams errors', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 502
			})
		);

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(result).toEqual({
			success: false,
			sources: [],
			error: 'Cinephage API returned 502: no streams available for this content'
		});
	});

	it('maps upstream 400 responses and extracts error message from body', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				json: vi.fn().mockResolvedValue({
					error: {
						message: 'TV streams require season and episode parameters'
					}
				})
			})
		);

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 562, type: 'movie' });

		expect(result).toEqual({
			success: false,
			sources: [],
			error: 'TV streams require season and episode parameters'
		});
	});

	it('parses new single-stream response format (url, provider, protocol, headers)', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'def4567890abcdef123456',
					cinephageVersion: '2.0.0'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					url: 'https://vidlink.pro/playlist.m3u8?token=abc',
					provider: 'Vidlink',
					quality: '1080p',
					protocol: 'hls',
					headers: {
						Origin: 'https://vidlink.pro',
						Referer: 'https://vidlink.pro/'
					}
				})
			})
		);

		const client = new CinephageBackendClient();
		const result = await client.getStreams({ tmdbId: 550, type: 'movie' });

		expect(result.success).toBe(true);
		expect(result.sources).toHaveLength(1);
		expect(result.sources[0]).toMatchObject({
			url: 'https://vidlink.pro/playlist.m3u8?token=abc',
			provider: 'Vidlink',
			quality: '1080p',
			type: 'hls'
		});
	});

	it('keeps manual streaming auth values while cleaning unsupported keys', async () => {
		await testDb.db
			.update(indexers)
			.set({
				settings: {
					cinephageCommit: 'abc1234567890abcdef',
					cinephageVersion: '1.0.0',
					cinephageClientKey: 'legacy-key',
					cinephageApiBaseUrl: 'https://override.invalid',
					externalHost: 'example.com:3000',
					useHttps: 'true'
				}
			})
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		const settings = await getStreamingIndexerSettings();
		expect(settings).toMatchObject({
			cinephageCommit: 'abc1234567890abcdef',
			cinephageVersion: '1.0.0',
			externalHost: 'example.com:3000',
			useHttps: 'true',
			baseUrl: 'https://example.com:3000'
		});

		const [row] = await testDb.db
			.select({ settings: indexers.settings })
			.from(indexers)
			.where(eq(indexers.definitionId, CINEPHAGE_STREAM_DEFINITION_ID));

		expect(row?.settings).toEqual({
			cinephageCommit: 'abc1234567890abcdef',
			cinephageVersion: '1.0.0',
			externalHost: 'example.com:3000',
			useHttps: 'true'
		});
	});
});
