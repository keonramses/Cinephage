import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from './SearchOrchestrator';
import type { IndexerCapabilities } from '../types';

// Shared mock capabilities for test indexers
const mockCapabilities: IndexerCapabilities = {
	search: { available: true, supportedParams: ['q'] },
	tvSearch: { available: true, supportedParams: ['q', 'season', 'ep'] },
	movieSearch: { available: true, supportedParams: ['q', 'year'] },
	categories: new Map(),
	supportsPagination: true,
	supportsInfoHash: false,
	limitMax: 100,
	limitDefault: 50,
	searchFormats: {
		episode: ['standard', 'european', 'compact']
	}
};

describe('SearchOrchestrator.executeMultiTitleTextSearch', () => {
	it('embeds episode format into query for TV searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			season: 1,
			episode: 5
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		// With the new architecture, queries are CLEAN (no embedded tokens)
		// and preferredEpisodeFormat tells TemplateEngine which format to use
		const queries = captured.map((c) => c.query);
		const formats = captured.map((c) => c.preferredEpisodeFormat);

		// All queries should be clean (just the title)
		expect(queries.every((q: string) => q === 'My Show')).toBe(true);

		// Should have all three format variants
		expect(formats).toContain('standard');
		expect(formats).toContain('european');
		expect(formats).toContain('compact');
	});

	it('embeds season-only format into query when no episode specified', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			season: 2
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		// Season-only search should use standard format (S02)
		// Query is clean, preferredEpisodeFormat tells TemplateEngine to add S02
		const queries = captured.map((c) => c.query);
		const formats = captured.map((c) => c.preferredEpisodeFormat);

		expect(queries.every((q: string) => q === 'My Show')).toBe(true);
		expect(formats).toContain('standard'); // S02 is standard format
	});

	it('ignores empty title variants and avoids season-0 keyword suffix variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'One Piece',
			searchTitles: ['One Piece', '', '   ', 'One Piece'],
			season: 0
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured).toHaveLength(1);
		expect(captured[0].query).toBe('One Piece');
		expect(captured[0].preferredEpisodeFormat).toBeUndefined();
	});

	it('uses title for movie searches without episode format', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			query: 'The Matrix',
			year: 1999
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		const queries = captured.map((c) => c.query);
		expect(queries.some((q: string) => q.includes('The Matrix'))).toBe(true);
		// Default movie text-search fallback should try both year-constrained
		// and no-year variants for better cross-indexer compatibility.
		expect(captured.some((c: any) => c.year === 1999)).toBe(true);
		expect(captured.some((c: any) => c.year === undefined)).toBe(true);
	});

	it('adds title-only fallback variant for interactive TV episode searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'Stranger Things',
			season: 2,
			episode: 1
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.some((c: any) => c.preferredEpisodeFormat === 'standard')).toBe(true);
		expect(
			captured.some(
				(c: any) =>
					c.query === 'Stranger Things' &&
					c.season === undefined &&
					c.episode === undefined &&
					c.preferredEpisodeFormat === undefined
			)
		).toBe(true);
	});
});

describe('SearchOrchestrator.executeWithTiering', () => {
	it('falls back to text search when ID search returns no results', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				tvSearch: {
					available: true,
					supportedParams: ['q', 'imdbId', 'tvdbId', 'season', 'ep']
				},
				searchFormats: {
					episode: ['standard']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);

				// First call (ID search) returns no results.
				if (criteria.imdbId || criteria.tvdbId) {
					return [];
				}

				// Fallback text search returns a result.
				return [
					{
						guid: 'fallback-result',
						title: 'My Show S01E05 1080p WEB-DL',
						indexerId: 'test-indexer',
						indexerName: 'FakeIndexer',
						downloadUrl: 'https://example.test/download',
						detailsUrl: 'https://example.test/details',
						protocol: 'usenet',
						sourceProtocol: 'usenet',
						size: 1024,
						publishDate: new Date().toISOString(),
						seeders: 0,
						leechers: 0,
						grabs: 0,
						categories: [5000]
					}
				];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			imdbId: 'tt1234567',
			tvdbId: 123456,
			season: 1,
			episode: 5
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('text');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(2);
		expect(captured[0].imdbId).toBe('tt1234567');
		expect(captured[0].tvdbId).toBe(123456);
		expect(captured[1].imdbId).toBeUndefined();
		expect(captured[1].tvdbId).toBeUndefined();
		expect(captured[1].query).toBe('My Show');
		expect(captured[1].preferredEpisodeFormat).toBe('standard');
	});

	it('keeps ID search when ID results are found', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				tvSearch: {
					available: true,
					supportedParams: ['q', 'imdbId', 'tvdbId', 'season', 'ep']
				},
				searchFormats: {
					episode: ['standard']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);
				return [
					{
						guid: 'id-result',
						title: 'My Show S01E05 1080p WEB-DL',
						indexerId: 'test-indexer',
						indexerName: 'FakeIndexer',
						downloadUrl: 'https://example.test/download',
						detailsUrl: 'https://example.test/details',
						protocol: 'usenet',
						sourceProtocol: 'usenet',
						size: 1024,
						publishDate: new Date().toISOString(),
						seeders: 0,
						leechers: 0,
						grabs: 0,
						categories: [5000]
					}
				];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			imdbId: 'tt1234567',
			tvdbId: 123456,
			season: 1,
			episode: 5
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('id');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(1);
		expect(captured[0].imdbId).toBe('tt1234567');
		expect(captured[0].tvdbId).toBe(123456);
	});

	it('retries movie ID search without q/year before falling back to text', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				movieSearch: {
					available: true,
					supportedParams: ['q', 'imdbId']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);

				// First attempt: ID + q/year returns no results.
				if (criteria.imdbId && criteria.query) {
					return [];
				}

				// Second attempt: ID only returns a hit.
				if (criteria.imdbId && !criteria.query) {
					return [
						{
							guid: 'movie-id-only-result',
							title: 'Now.You.See.Me.3.2025.1080p.WEB-DL',
							indexerId: 'test-indexer',
							indexerName: 'FakeIndexer',
							downloadUrl: 'https://example.test/download',
							detailsUrl: 'https://example.test/details',
							protocol: 'usenet',
							sourceProtocol: 'usenet',
							size: 1024,
							publishDate: new Date().toISOString(),
							seeders: 0,
							leechers: 0,
							grabs: 0,
							categories: [2000]
						}
					];
				}

				// Text fallback should not be needed in this case.
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			query: "Now You See Me: Now You Don't",
			year: 2025,
			imdbId: 'tt4712810'
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('id');
		expect(result.releases).toHaveLength(1);
		expect(captured).toHaveLength(2);
		expect(captured[0].query).toBe("Now You See Me: Now You Don't");
		expect(captured[0].year).toBe(2025);
		expect(captured[1].query).toBeUndefined();
		expect(captured[1].year).toBeUndefined();
		expect(captured[1].imdbId).toBe('tt4712810');
	});

	it('supplements interactive movie ID results with text fallback variants', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: {
				...mockCapabilities,
				movieSearch: {
					available: true,
					supportedParams: ['q', 'imdbId']
				},
				searchFormats: {
					episode: ['standard'],
					movie: ['standard', 'noYear']
				}
			},
			search: async (criteria: any) => {
				captured.push(criteria);

				// ID search succeeds first.
				if (criteria.imdbId) {
					return [
						{
							guid: 'id-result',
							title: 'Now.You.See.Me.3.2025.1080p.WEB-DL',
							indexerId: 'test-indexer',
							indexerName: 'FakeIndexer',
							downloadUrl: 'https://example.test/download/id',
							detailsUrl: 'https://example.test/details/id',
							protocol: 'usenet',
							sourceProtocol: 'usenet',
							size: 1024,
							publishDate: new Date().toISOString(),
							seeders: 0,
							leechers: 0,
							grabs: 0,
							categories: [2000]
						}
					];
				}

				// Text variant returns a unique release.
				return [
					{
						guid: 'text-result',
						title: 'Now.You.See.Me.3.2025.2160p.BluRay.x265',
						indexerId: 'test-indexer',
						indexerName: 'FakeIndexer',
						downloadUrl: 'https://example.test/download/text',
						detailsUrl: 'https://example.test/details/text',
						protocol: 'usenet',
						sourceProtocol: 'usenet',
						size: 2048,
						publishDate: new Date().toISOString(),
						seeders: 0,
						leechers: 0,
						grabs: 0,
						categories: [2000]
					}
				];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: "Now You See Me: Now You Don't",
			year: 2025,
			imdbId: 'tt4712810',
			searchTitles: ["Now You See Me: Now You Don't", 'Now You See Me 3']
		} as any;

		const result = await (orchestrator as any).executeWithTiering(fakeIndexer, criteria);

		expect(result.searchMethod).toBe('text');
		expect(result.releases).toHaveLength(2);
		expect(result.releases.some((r: any) => r.guid === 'id-result')).toBe(true);
		expect(result.releases.some((r: any) => r.guid === 'text-result')).toBe(true);
		expect(captured[0].imdbId).toBe('tt4712810');
		expect(captured[1].imdbId).toBeUndefined();
	});
});

describe('SearchOrchestrator.filterBySeasonEpisode', () => {
	const orchestrator = new SearchOrchestrator();

	it('prefers exact episode matches for interactive season+episode search', () => {
		const releases = [
			{ title: 'Smallville.S01E01.1080p.WEBRip' },
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01-S05.1080p.BluRay' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1,
			episode: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r: any) => r.title);

		expect(titles).toEqual(['Smallville.S01E01.1080p.WEBRip']);
	});

	it('falls back to single-season packs for interactive season+episode search when exact episode is missing', () => {
		const releases = [
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01-S05.1080p.BluRay' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1,
			episode: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r: any) => r.title);
		const guids = filtered.map((r: any) => r.guid ?? '');

		expect(filtered).toHaveLength(1);
		expect(titles[0]).toContain('Season 1 Episode 1 - ');
		expect(titles[0]).toContain('Smallville.S01.COMPLETE.1080p.BluRay');
		expect(guids[0]).toContain('episode-pointer::s01e01');
		expect(filtered[0].season).toBe(1);
		expect(filtered[0].episode).toBe(1);
	});

	it('keeps season-only interactive searches as season packs', () => {
		const releases = [
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01E01.1080p.WEBRip' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Smallville.S01.COMPLETE.1080p.BluRay');
	});

	it('formats season-pack titles for season-only interactive searches', () => {
		const releases = [{ title: '/ Stranger Things / S1E1-8 8 [2016, WEB-DL 2160p]' }] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			season: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Stranger Things: S1E1-8 of 8 [2016, WEB-DL 2160p]');
	});

	it('keeps single-season packs for automatic season+episode search', () => {
		const releases = [
			{ title: 'Smallville.S01E01.1080p.WEBRip' },
			{ title: 'Smallville.S01.COMPLETE.1080p.BluRay' },
			{ title: 'Smallville.S01-S05.1080p.BluRay' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			season: 1,
			episode: 1
		} as any;

		const filtered = (orchestrator as any).filterBySeasonEpisode(releases, criteria);
		const titles = filtered.map((r: any) => r.title).sort();

		expect(titles).toEqual(
			['Smallville.S01.COMPLETE.1080p.BluRay', 'Smallville.S01E01.1080p.WEBRip'].sort()
		);
	});
});

describe('SearchOrchestrator.filterByIdOrTitleMatch', () => {
	const orchestrator = new SearchOrchestrator();

	it('rejects wrong-year movie releases even without searchTitles', () => {
		const releases = [
			{ title: 'Now.You.See.Me.2013.1080p.BluRay.x264', indexerName: 'FakeIndexer' },
			{
				title: 'Now.You.See.Me.Now.You.Dont.2025.1080p.WEB-DL.DDP5.1.H.265',
				indexerName: 'FakeIndexer'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: "Now You See Me: Now You Don't",
			imdbId: 'tt4712810',
			tmdbId: 425274,
			year: 2025
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		const titles = filtered.map((r: any) => r.title);

		expect(titles).toEqual(['Now.You.See.Me.Now.You.Dont.2025.1080p.WEB-DL.DDP5.1.H.265']);
	});

	it('keeps movie releases with unknown year when IDs are absent', () => {
		const releases = [
			{ title: 'Now.You.See.Me.Now.You.Dont.1080p.WEB-DL.REPACK', indexerName: 'FakeIndexer' }
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: "Now You See Me: Now You Don't",
			imdbId: 'tt4712810',
			tmdbId: 425274,
			year: 2025
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Now.You.See.Me.Now.You.Dont.1080p.WEB-DL.REPACK');
	});

	it('keeps interactive movie results when title is localized and year is missing', () => {
		const releases = [{ title: 'Военная машина WEB-DL', indexerName: 'FakeIndexer' }] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'interactive',
			query: 'War Machine',
			searchTitles: ['War Machine'],
			year: 2017
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toBe('Военная машина WEB-DL');
	});

	it('keeps automatic filtering strict for localized title mismatch', () => {
		const releases = [{ title: 'Военная машина WEB-DL', indexerName: 'FakeIndexer' }] as any[];

		const criteria = {
			searchType: 'movie',
			searchSource: 'automatic',
			query: 'War Machine',
			searchTitles: ['War Machine'],
			year: 2017
		} as any;

		const filtered = (orchestrator as any).filterByIdOrTitleMatch(releases, criteria);
		expect(filtered).toHaveLength(0);
	});
});

describe('SearchOrchestrator.filterByTitleRelevance', () => {
	const orchestrator = new SearchOrchestrator();

	it('keeps tracker titles that contain the expected movie title plus extra metadata', () => {
		const releases = [
			{
				title:
					'War Machine (Patrick Hughes) [2026, UK, Australia, New Zealand, USA, sci-fi, action, WEB-DLRip] Dub + Sub (Rus, Eng)'
			},
			{
				title: 'Completely Different Movie [2026, USA, WEB-DLRip]'
			}
		] as any[];

		const criteria = {
			searchType: 'movie',
			query: 'War Machine',
			searchTitles: ['War Machine', 'Máquina de Guerra']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('War Machine');
	});

	it('keeps TV releases with long tracker metadata when series title matches', () => {
		const releases = [
			{
				title: 'The Night Agent / Ночной агент S03E10 [2026, WEB-DL 1080p, Dub, Sub Rus, Eng]'
			},
			{
				title: 'Different Show S03E10 [2026, WEB-DL 1080p]'
			}
		] as any[];

		const criteria = {
			searchType: 'tv',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].title).toContain('The Night Agent');
	});

	it('falls back to pre-filtered releases for interactive TV when relevance removes all', () => {
		const releases = [
			{ title: 'Совсем другой сериал S01E01 [2026, WEB-DL 1080p]' },
			{ title: 'Не связано S01E02 [2026, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(2);
		expect(filtered).toEqual(releases);
	});

	it('keeps episode-targeted TV searches strict and does not fallback to unrelated results', () => {
		const releases = [
			{ title: 'Совсем другой сериал S01E01 [2026, WEB-DL 1080p]' },
			{ title: 'Не связано S01E02 [2026, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'interactive',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti'],
			season: 1,
			episode: 2
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});

	it('keeps automatic TV title relevance strict when no titles match', () => {
		const releases = [
			{ title: 'Completely Different Show S01E01 [2026, WEB-DL 1080p]' },
			{ title: 'Not Related Series S01E02 [2026, WEB-DL 1080p]' }
		] as any[];

		const criteria = {
			searchType: 'tv',
			searchSource: 'automatic',
			query: 'The Night Agent',
			searchTitles: ['The Night Agent', 'Gecə Agenti']
		} as any;

		const filtered = (orchestrator as any).filterByTitleRelevance(releases, criteria);
		expect(filtered).toHaveLength(0);
	});
});
