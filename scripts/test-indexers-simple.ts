#!/usr/bin/env npx tsx
/**
 * Simple Indexer Search Test
 *
 * Tests that each indexer can search properly using the search parameters
 * they support (IMDB ID, TMDB ID, TVDB ID, text query, etc.)
 */

import { getIndexerManager } from '../src/lib/server/indexers/IndexerManager';
import {
	getAllNativeIndexerDefinitions,
	createNativeIndexer
} from '../src/lib/server/indexers/definitions/registry';
import type {
	MovieSearchCriteria,
	TvSearchCriteria,
	BasicSearchCriteria,
	IndexerCapabilities
} from '../src/lib/server/indexers/types';

// ANSI colors
const c = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	dim: '\x1b[2m'
};

// Test data with proper IDs
const TEST_MOVIE = {
	title: 'The Matrix',
	year: 1999,
	tmdbId: 603,
	imdbId: 'tt0133093'
};

const TEST_TV = {
	title: 'Breaking Bad',
	year: 2008,
	tmdbId: 1396,
	tvdbId: 81189,
	imdbId: 'tt0903747',
	season: 1,
	episode: 1
};

async function testIndexer(
	indexer: { search: (criteria: any) => Promise<any[]>; capabilities: IndexerCapabilities },
	name: string,
	protocol: string,
	accessType: string
) {
	console.log(`\n${c.cyan}Testing ${name}${c.reset} (${protocol}/${accessType})`);

	const caps = indexer.capabilities;
	const results: { test: string; passed: boolean; count: number; error?: string }[] = [];

	// Test movie search if supported
	if (caps.movieSearch?.available) {
		const supportedParams = caps.movieSearch.supportedParams;
		console.log(`  Movie search params: ${supportedParams.join(', ')}`);

		try {
			const criteria: MovieSearchCriteria = { searchType: 'movie' };

			// Use the best available ID parameter
			if (supportedParams.includes('imdbId')) {
				criteria.imdbId = TEST_MOVIE.imdbId;
			} else if (supportedParams.includes('tmdbId')) {
				criteria.tmdbId = TEST_MOVIE.tmdbId;
			}

			// Add text query as fallback/supplement
			if (supportedParams.includes('q')) {
				criteria.query = TEST_MOVIE.title;
			}

			if (supportedParams.includes('year')) {
				criteria.year = TEST_MOVIE.year;
			}

			const searchResults = await indexer.search(criteria);
			results.push({ test: 'Movie', passed: true, count: searchResults.length });
			console.log(`  ${c.green}✓${c.reset} Movie: ${searchResults.length} results`);
		} catch (err: any) {
			results.push({ test: 'Movie', passed: false, count: 0, error: err.message });
			console.log(`  ${c.red}✗${c.reset} Movie: ${err.message}`);
		}
	}

	// Test TV search if supported
	if (caps.tvSearch?.available) {
		const supportedParams = caps.tvSearch.supportedParams;
		console.log(`  TV search params: ${supportedParams.join(', ')}`);

		try {
			const criteria: TvSearchCriteria = { searchType: 'tv' };

			// Use the best available ID parameter
			if (supportedParams.includes('tvdbId')) {
				criteria.tvdbId = TEST_TV.tvdbId;
			} else if (supportedParams.includes('imdbId')) {
				criteria.imdbId = TEST_TV.imdbId;
			} else if (supportedParams.includes('tmdbId')) {
				criteria.tmdbId = TEST_TV.tmdbId;
			}

			if (supportedParams.includes('q')) {
				criteria.query = TEST_TV.title;
			}

			if (supportedParams.includes('season')) {
				criteria.season = TEST_TV.season;
			}

			if (supportedParams.includes('ep')) {
				criteria.episode = TEST_TV.episode;
			}

			const searchResults = await indexer.search(criteria);
			results.push({ test: 'TV', passed: true, count: searchResults.length });
			console.log(`  ${c.green}✓${c.reset} TV: ${searchResults.length} results`);
		} catch (err: any) {
			results.push({ test: 'TV', passed: false, count: 0, error: err.message });
			console.log(`  ${c.red}✗${c.reset} TV: ${err.message}`);
		}
	}

	// Test basic search if movie/TV not supported
	if (caps.search?.available && !caps.movieSearch?.available && !caps.tvSearch?.available) {
		try {
			const criteria: BasicSearchCriteria = {
				searchType: 'basic',
				query: 'matrix'
			};

			const searchResults = await indexer.search(criteria);
			results.push({ test: 'Basic', passed: true, count: searchResults.length });
			console.log(`  ${c.green}✓${c.reset} Basic: ${searchResults.length} results`);
		} catch (err: any) {
			results.push({ test: 'Basic', passed: false, count: 0, error: err.message });
			console.log(`  ${c.red}✗${c.reset} Basic: ${err.message}`);
		}
	}

	return results;
}

async function main() {
	console.log(
		`${c.bold}╔════════════════════════════════════════════════════════════════╗${c.reset}`
	);
	console.log(
		`${c.bold}║          SIMPLE INDEXER SEARCH TEST                            ║${c.reset}`
	);
	console.log(
		`${c.bold}╚════════════════════════════════════════════════════════════════╝${c.reset}`
	);

	// Initialize
	const manager = await getIndexerManager();
	await manager.initialize();

	const definitions = getAllNativeIndexerDefinitions();
	const publicDefs = definitions.filter((d) => d.type === 'public' && !d.internal);

	console.log(`\nFound ${publicDefs.length} public native indexers to test`);

	const allResults: { name: string; results: any[] }[] = [];

	for (const def of publicDefs) {
		try {
			// Create a temporary config for the indexer
			const config = {
				id: `test-${def.id}`,
				name: def.name,
				definitionId: def.id,
				enabled: true,
				baseUrl: def.siteUrl,
				alternateUrls: def.alternateUrls || [],
				priority: 50,
				protocol: def.protocol,
				enableAutomaticSearch: true,
				enableInteractiveSearch: true,
				settings: {}
			};

			const indexer = createNativeIndexer(config as any);
			if (!indexer) {
				console.log(`\n${c.yellow}⚠${c.reset} Could not create ${def.name}`);
				continue;
			}

			const results = await testIndexer(indexer, def.name, def.protocol, def.type);
			allResults.push({ name: def.name, results });
		} catch (err: any) {
			console.log(`\n${c.red}✗${c.reset} ${def.name}: ${err.message}`);
		}
	}

	// Summary
	console.log(
		`\n${c.bold}════════════════════════════════════════════════════════════════${c.reset}`
	);
	console.log(`${c.bold}SUMMARY${c.reset}`);
	console.log(
		`${c.bold}════════════════════════════════════════════════════════════════${c.reset}`
	);

	for (const { name, results } of allResults) {
		const passed = results.filter((r) => r.passed).length;
		const total = results.length;
		const status = passed === total ? c.green : passed > 0 ? c.yellow : c.red;
		console.log(`${status}${name}${c.reset}: ${passed}/${total} tests passed`);
	}
}

main().catch(console.error);
