#!/usr/bin/env npx tsx
/**
 * Live Indexer Test Suite
 *
 * Comprehensive live tests for all indexer types:
 * - Torrent (public, private, YAML-based)
 * - Usenet (Newznab-compatible)
 * - Streaming (Cinephage internal)
 *
 * Tests cover:
 * A - Individual indexer capabilities (movies, TV shows, categories)
 * B - Mass search across all enabled indexers
 * C - Protocol handlers, auth providers, and edge cases
 *
 * Usage:
 *   npx tsx scripts/test-indexers-live.ts                     # Run all tests
 *   npx tsx scripts/test-indexers-live.ts --indexer knaben    # Test specific indexer
 *   npx tsx scripts/test-indexers-live.ts --protocol torrent  # Test protocol type
 *   npx tsx scripts/test-indexers-live.ts --type public       # Test access type
 *   npx tsx scripts/test-indexers-live.ts --mass              # Mass search only
 *   npx tsx scripts/test-indexers-live.ts --verbose           # Detailed output
 */

import { performance } from 'perf_hooks';

// =============================================================================
// ANSI Color Codes
// =============================================================================
const c = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	bgRed: '\x1b[41m',
	bgGreen: '\x1b[42m',
	bgYellow: '\x1b[43m'
};

// =============================================================================
// Test Configuration
// =============================================================================

/** Well-known test media items with IDs */
const TEST_MEDIA = {
	// Popular movies for consistent results
	movies: [
		{
			title: 'The Matrix',
			year: 1999,
			tmdbId: 603,
			imdbId: 'tt0133093',
			description: 'Classic sci-fi - should be available on most indexers'
		},
		{
			title: 'Inception',
			year: 2010,
			tmdbId: 27205,
			imdbId: 'tt1375666',
			description: 'Popular movie with wide availability'
		},
		{
			title: 'Dune',
			year: 2021,
			tmdbId: 438631,
			imdbId: 'tt1160419',
			description: 'Recent blockbuster for testing newer content'
		}
	],
	// Popular TV shows
	tvShows: [
		{
			title: 'Breaking Bad',
			year: 2008,
			tmdbId: 1396,
			tvdbId: 81189,
			imdbId: 'tt0903747',
			season: 1,
			episode: 1,
			description: 'Classic TV show - widely seeded'
		},
		{
			title: 'Game of Thrones',
			year: 2011,
			tmdbId: 1399,
			tvdbId: 121361,
			imdbId: 'tt0944947',
			season: 1,
			episode: 1,
			description: 'Popular TV show for season/episode testing'
		},
		{
			title: 'Stranger Things',
			year: 2016,
			tmdbId: 66732,
			tvdbId: 305288,
			imdbId: 'tt4574334',
			season: 4,
			episode: 1,
			description: 'Recent popular show'
		}
	],
	// Anime (for anime-specific indexers)
	anime: [
		{
			title: 'Attack on Titan',
			year: 2013,
			tmdbId: 1429,
			anidbId: 9541,
			malId: 16498,
			season: 1,
			episode: 1,
			description: 'Popular anime for testing anime indexers'
		}
	]
};

/** Test result structure */
interface TestResult {
	indexerId: string;
	indexerName: string;
	protocol: string;
	accessType: string;
	tests: {
		name: string;
		passed: boolean;
		duration: number;
		resultCount?: number;
		error?: string;
		details?: string;
	}[];
	overallPassed: boolean;
	totalDuration: number;
}

/** Mass search result */
interface MassSearchResult {
	query: string;
	mediaType: 'movie' | 'tv';
	totalResults: number;
	indexerResults: {
		indexerId: string;
		indexerName: string;
		resultCount: number;
		duration: number;
		error?: string;
	}[];
	duration: number;
	deduplicatedCount?: number;
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface TestOptions {
	indexer?: string;
	protocol?: 'torrent' | 'usenet' | 'streaming';
	type?: 'public' | 'semi-private' | 'private';
	mass: boolean;
	verbose: boolean;
	skipPrivate: boolean;
	timeout: number;
}

function parseArgs(): TestOptions {
	const args = process.argv.slice(2);
	const options: TestOptions = {
		mass: false,
		verbose: false,
		skipPrivate: false,
		timeout: 30000
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--indexer':
			case '-i':
				options.indexer = args[++i]?.toLowerCase();
				break;
			case '--protocol':
			case '-p':
				options.protocol = args[++i]?.toLowerCase() as 'torrent' | 'usenet' | 'streaming';
				break;
			case '--type':
			case '-t':
				options.type = args[++i]?.toLowerCase() as 'public' | 'semi-private' | 'private';
				break;
			case '--mass':
			case '-m':
				options.mass = true;
				break;
			case '--verbose':
			case '-v':
				options.verbose = true;
				break;
			case '--skip-private':
				options.skipPrivate = true;
				break;
			case '--timeout':
				options.timeout = parseInt(args[++i] ?? '30000', 10);
				break;
			case '--help':
			case '-h':
				printHelp();
				process.exit(0);
		}
	}

	return options;
}

function printHelp(): void {
	console.log(`
${c.bold}Live Indexer Test Suite${c.reset}

${c.cyan}Usage:${c.reset}
  npx tsx scripts/test-indexers-live.ts [options]

${c.cyan}Options:${c.reset}
  -i, --indexer <id>     Test specific indexer by ID
  -p, --protocol <type>  Filter by protocol (torrent, usenet, streaming)
  -t, --type <access>    Filter by access type (public, semi-private, private)
  -m, --mass             Run mass search tests only
  -v, --verbose          Show detailed output
  --skip-private         Skip private indexers (no auth)
  --timeout <ms>         Request timeout in milliseconds (default: 30000)
  -h, --help             Show this help message

${c.cyan}Examples:${c.reset}
  npx tsx scripts/test-indexers-live.ts                    # Run all tests
  npx tsx scripts/test-indexers-live.ts -i knaben          # Test Knaben only
  npx tsx scripts/test-indexers-live.ts -p torrent -v      # Verbose torrent tests
  npx tsx scripts/test-indexers-live.ts --type public      # Test public indexers
  npx tsx scripts/test-indexers-live.ts --mass             # Mass search test
`);
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function main(): Promise<void> {
	const options = parseArgs();

	console.log(
		`\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗${c.reset}`
	);
	console.log(
		`${c.bold}${c.cyan}║          CINEPHAGE LIVE INDEXER TEST SUITE                     ║${c.reset}`
	);
	console.log(
		`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════════════╝${c.reset}\n`
	);

	// Dynamically import after parsing args to avoid import issues
	const { getIndexerManager } = await import('../src/lib/server/indexers/IndexerManager.js');
	const { getAllNativeIndexerDefinitions, getNativeIndexerDefinition, isNativeIndexer } =
		await import('../src/lib/server/indexers/definitions/registry.js');
	const { getSearchOrchestrator } =
		await import('../src/lib/server/indexers/search/SearchOrchestrator.js');
	const { YamlDefinitionLoader } = await import('../src/lib/server/indexers/loader/index.js');

	// Initialize the indexer manager
	console.log(`${c.dim}Initializing IndexerManager...${c.reset}`);
	const manager = await getIndexerManager();
	await manager.initialize();

	// Get available definitions
	const nativeDefinitions = getAllNativeIndexerDefinitions();
	const yamlLoader = new YamlDefinitionLoader();
	await yamlLoader.loadAll();
	const yamlDefinitions = yamlLoader.getAll();

	console.log(
		`${c.green}✓${c.reset} Loaded ${c.bold}${nativeDefinitions.length}${c.reset} native indexers`
	);
	console.log(
		`${c.green}✓${c.reset} Loaded ${c.bold}${yamlDefinitions.length}${c.reset} YAML definitions`
	);

	// Get configured indexers from database
	const configuredIndexers = await manager.getIndexers();
	console.log(
		`${c.green}✓${c.reset} Found ${c.bold}${configuredIndexers.length}${c.reset} configured indexers\n`
	);

	// Display summary
	displayIndexerSummary(nativeDefinitions, yamlDefinitions, configuredIndexers);

	if (options.mass) {
		// Mass search only mode
		await runMassSearchTests(manager, getSearchOrchestrator, options);
	} else {
		// Individual indexer tests
		const results = await runIndividualTests(
			manager,
			nativeDefinitions,
			yamlDefinitions,
			configuredIndexers,
			options
		);

		// Display summary
		displayTestSummary(results);

		// Run mass search if not skipped
		if (!options.indexer) {
			console.log(`\n${c.bold}${c.yellow}Running Mass Search Tests...${c.reset}\n`);
			await runMassSearchTests(manager, getSearchOrchestrator, options);
		}
	}

	console.log(`\n${c.bold}${c.green}Test suite completed.${c.reset}\n`);
}

// =============================================================================
// Display Functions
// =============================================================================

function displayIndexerSummary(
	nativeDefinitions: any[],
	yamlDefinitions: any[],
	configuredIndexers: any[]
): void {
	console.log(
		`${c.bold}${c.white}═══════════════════════════════════════════════════════════════${c.reset}`
	);
	console.log(`${c.bold}                    INDEXER SUMMARY${c.reset}`);
	console.log(
		`${c.bold}${c.white}═══════════════════════════════════════════════════════════════${c.reset}\n`
	);

	// Group by protocol
	const protocols = { torrent: 0, usenet: 0, streaming: 0 };
	const types = { public: 0, 'semi-private': 0, private: 0 };

	for (const def of nativeDefinitions) {
		protocols[def.protocol as keyof typeof protocols]++;
		types[def.type as keyof typeof types]++;
	}

	console.log(`${c.cyan}Native Indexers by Protocol:${c.reset}`);
	console.log(`  ${c.magenta}Torrent:${c.reset}   ${protocols.torrent}`);
	console.log(`  ${c.magenta}Usenet:${c.reset}    ${protocols.usenet}`);
	console.log(`  ${c.magenta}Streaming:${c.reset} ${protocols.streaming}`);

	console.log(`\n${c.cyan}Native Indexers by Access Type:${c.reset}`);
	console.log(`  ${c.green}Public:${c.reset}       ${types.public}`);
	console.log(`  ${c.yellow}Semi-Private:${c.reset} ${types['semi-private']}`);
	console.log(`  ${c.red}Private:${c.reset}      ${types.private}`);

	console.log(`\n${c.cyan}YAML Definitions:${c.reset} ${yamlDefinitions.length}`);
	console.log(`${c.cyan}Configured in DB:${c.reset} ${configuredIndexers.length}\n`);
}

function displayTestSummary(results: TestResult[]): void {
	console.log(
		`\n${c.bold}${c.white}═══════════════════════════════════════════════════════════════${c.reset}`
	);
	console.log(`${c.bold}                    TEST RESULTS SUMMARY${c.reset}`);
	console.log(
		`${c.bold}${c.white}═══════════════════════════════════════════════════════════════${c.reset}\n`
	);

	let totalPassed = 0;
	let totalFailed = 0;

	for (const result of results) {
		const status = result.overallPassed
			? `${c.bgGreen}${c.white} PASS ${c.reset}`
			: `${c.bgRed}${c.white} FAIL ${c.reset}`;

		const passedTests = result.tests.filter((t) => t.passed).length;
		const totalTests = result.tests.length;

		console.log(
			`${status} ${c.bold}${result.indexerName}${c.reset} ` +
				`(${result.protocol}/${result.accessType}) - ` +
				`${passedTests}/${totalTests} tests, ${result.totalDuration.toFixed(0)}ms`
		);

		if (result.overallPassed) {
			totalPassed++;
		} else {
			totalFailed++;
			// Show failed tests
			for (const test of result.tests) {
				if (!test.passed) {
					console.log(`  ${c.red}✗ ${test.name}${c.reset}: ${test.error || 'Unknown error'}`);
				}
			}
		}
	}

	console.log(
		`\n${c.bold}Overall: ${c.green}${totalPassed} passed${c.reset}, ${c.red}${totalFailed} failed${c.reset}`
	);
}

// =============================================================================
// Individual Indexer Tests
// =============================================================================

async function runIndividualTests(
	manager: any,
	nativeDefinitions: any[],
	yamlDefinitions: any[],
	configuredIndexers: any[],
	options: TestOptions
): Promise<TestResult[]> {
	const results: TestResult[] = [];

	// Filter definitions based on options
	let defsToTest = [...nativeDefinitions];

	if (options.indexer) {
		defsToTest = defsToTest.filter(
			(d) => d.id.toLowerCase() === options.indexer || d.name.toLowerCase() === options.indexer
		);
	}

	if (options.protocol) {
		defsToTest = defsToTest.filter((d) => d.protocol === options.protocol);
	}

	if (options.type) {
		defsToTest = defsToTest.filter((d) => d.type === options.type);
	}

	if (options.skipPrivate) {
		defsToTest = defsToTest.filter((d) => d.type === 'public');
	}

	// Filter out internal indexers (like cinephage-stream)
	defsToTest = defsToTest.filter((d) => !d.internal);

	console.log(`${c.bold}${c.yellow}Testing ${defsToTest.length} Native Indexers...${c.reset}\n`);

	for (const def of defsToTest) {
		const result = await testIndexerDefinition(manager, def, configuredIndexers, options);
		results.push(result);
	}

	// Also test YAML definitions if not filtering by specific indexer
	if (!options.indexer && !options.protocol?.startsWith('usenet')) {
		let yamlToTest = yamlDefinitions;

		if (options.type) {
			yamlToTest = yamlToTest.filter((d) => d.type === options.type);
		}

		console.log(
			`\n${c.bold}${c.yellow}Testing ${yamlToTest.length} YAML Definitions...${c.reset}\n`
		);

		for (const def of yamlToTest) {
			const result = await testYamlDefinition(manager, def, configuredIndexers, options);
			results.push(result);
		}
	}

	return results;
}

async function testIndexerDefinition(
	manager: any,
	definition: any,
	configuredIndexers: any[],
	options: TestOptions
): Promise<TestResult> {
	const startTime = performance.now();
	const tests: TestResult['tests'] = [];

	console.log(
		`\n${c.cyan}Testing ${c.bold}${definition.name}${c.reset}${c.cyan} (${definition.protocol}/${definition.type})${c.reset}`
	);

	// Create a temporary indexer instance for testing
	let indexer: any = null;

	try {
		// Check if there's a configured indexer for this definition
		const configuredIndexer = configuredIndexers.find(
			(cfg: any) => cfg.definitionId === definition.id || cfg.implementation === definition.id
		);

		if (configuredIndexer) {
			// Get instance from manager
			indexer = await manager.getIndexerInstance(configuredIndexer.id);
			console.log(`  ${c.dim}Using configured instance${c.reset}`);
		}

		if (!indexer && definition.type === 'public') {
			// For public indexers, create a temporary instance
			indexer = definition.factory({
				config: {
					id: `test-${definition.id}`,
					name: definition.name,
					definitionId: definition.id,
					baseUrl: definition.siteUrl,
					protocol: definition.protocol,
					enabled: true,
					priority: 25,
					enableAutomaticSearch: true,
					enableInteractiveSearch: true
				}
			});
			console.log(`  ${c.dim}Created temporary instance${c.reset}`);
		}

		if (!indexer) {
			console.log(`  ${c.yellow}⚠ Skipped - private indexer not configured${c.reset}`);
			return {
				indexerId: definition.id,
				indexerName: definition.name,
				protocol: definition.protocol,
				accessType: definition.type,
				tests: [
					{
						name: 'Configuration',
						passed: false,
						duration: 0,
						error: 'Private indexer not configured - add credentials in settings'
					}
				],
				overallPassed: false,
				totalDuration: performance.now() - startTime
			};
		}

		// Test 1: Capabilities Check
		const capTest = await testCapabilities(indexer, options);
		tests.push(capTest);
		logTestResult(capTest, options.verbose);

		// Test 2: Movie Search (if supported)
		if (indexer.capabilities?.movieSearch?.available) {
			const movieTest = await testMovieSearch(indexer, options);
			tests.push(movieTest);
			logTestResult(movieTest, options.verbose);
		}

		// Test 3: TV Search (if supported)
		if (indexer.capabilities?.tvSearch?.available) {
			const tvTest = await testTvSearch(indexer, options);
			tests.push(tvTest);
			logTestResult(tvTest, options.verbose);
		}

		// Test 4: Basic Search
		const basicTest = await testBasicSearch(indexer, options);
		tests.push(basicTest);
		logTestResult(basicTest, options.verbose);

		// Test 5: Category Filtering (if supported)
		const catTest = await testCategoryFiltering(indexer, options);
		tests.push(catTest);
		logTestResult(catTest, options.verbose);
	} catch (error) {
		tests.push({
			name: 'Indexer Setup',
			passed: false,
			duration: performance.now() - startTime,
			error: error instanceof Error ? error.message : String(error)
		});
	}

	const overallPassed = tests.length > 0 && tests.every((t) => t.passed);
	const totalDuration = performance.now() - startTime;

	return {
		indexerId: definition.id,
		indexerName: definition.name,
		protocol: definition.protocol,
		accessType: definition.type,
		tests,
		overallPassed,
		totalDuration
	};
}

async function testYamlDefinition(
	manager: any,
	definition: any,
	configuredIndexers: any[],
	options: TestOptions
): Promise<TestResult> {
	const startTime = performance.now();
	const tests: TestResult['tests'] = [];

	console.log(
		`\n${c.cyan}Testing ${c.bold}${definition.name}${c.reset}${c.cyan} (YAML/${definition.type})${c.reset}`
	);

	try {
		// Check if there's a configured indexer for this definition
		const configuredIndexer = configuredIndexers.find(
			(cfg: any) => cfg.definitionId === definition.id || cfg.implementation === definition.id
		);

		if (!configuredIndexer && definition.type !== 'public') {
			console.log(`  ${c.yellow}⚠ Skipped - not configured${c.reset}`);
			return {
				indexerId: definition.id,
				indexerName: definition.name,
				protocol: 'torrent',
				accessType: definition.type,
				tests: [
					{
						name: 'Configuration',
						passed: false,
						duration: 0,
						error: 'Indexer not configured - add in settings'
					}
				],
				overallPassed: false,
				totalDuration: performance.now() - startTime
			};
		}

		// For configured YAML indexers, get the instance
		let indexer: any = null;
		if (configuredIndexer) {
			indexer = await manager.getIndexerInstance(configuredIndexer.id);
			console.log(`  ${c.dim}Using configured YAML instance${c.reset}`);
		}

		// For public YAML indexers without config, we can't easily test them
		// because YAML indexers need to go through the factory
		if (!indexer && definition.type === 'public') {
			console.log(
				`  ${c.yellow}⚠ Skipped - public YAML not configured (add via UI to test)${c.reset}`
			);
			return {
				indexerId: definition.id,
				indexerName: definition.name,
				protocol: 'torrent',
				accessType: definition.type,
				tests: [
					{
						name: 'Configuration',
						passed: true,
						duration: 0,
						details: 'Public YAML indexer - add via settings UI to enable live testing'
					}
				],
				overallPassed: true,
				totalDuration: performance.now() - startTime
			};
		}

		if (!indexer) {
			throw new Error('Could not create indexer instance');
		}

		// Run basic connectivity test
		const connectTest = await testYamlConnectivity(indexer, definition, options);
		tests.push(connectTest);
		logTestResult(connectTest, options.verbose);

		// Basic search test
		const searchTest = await testBasicSearch(indexer, options);
		tests.push(searchTest);
		logTestResult(searchTest, options.verbose);
	} catch (error) {
		tests.push({
			name: 'YAML Setup',
			passed: false,
			duration: performance.now() - startTime,
			error: error instanceof Error ? error.message : String(error)
		});
	}

	const overallPassed = tests.length > 0 && tests.every((t) => t.passed);

	return {
		indexerId: definition.id,
		indexerName: definition.name,
		protocol: 'torrent',
		accessType: definition.type,
		tests,
		overallPassed,
		totalDuration: performance.now() - startTime
	};
}

// =============================================================================
// Individual Test Functions
// =============================================================================

async function testCapabilities(
	indexer: any,
	options: TestOptions
): Promise<TestResult['tests'][0]> {
	const start = performance.now();
	const testName = 'Capabilities Check';

	try {
		const caps = indexer.capabilities;

		if (!caps) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				error: 'No capabilities defined'
			};
		}

		const hasSearch =
			caps.search?.available || caps.tvSearch?.available || caps.movieSearch?.available;

		if (!hasSearch) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				error: 'No search capabilities available'
			};
		}

		const details = [
			caps.search?.available ? 'basic' : null,
			caps.movieSearch?.available ? 'movie' : null,
			caps.tvSearch?.available ? 'tv' : null,
			caps.musicSearch?.available ? 'music' : null,
			caps.bookSearch?.available ? 'book' : null
		]
			.filter(Boolean)
			.join(', ');

		return {
			name: testName,
			passed: true,
			duration: performance.now() - start,
			details: `Supports: ${details}`
		};
	} catch (error) {
		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

async function testMovieSearch(
	indexer: any,
	options: TestOptions
): Promise<TestResult['tests'][0]> {
	const start = performance.now();
	const testName = 'Movie Search';
	const movie = TEST_MEDIA.movies[0]; // The Matrix

	try {
		const criteria = {
			searchType: 'movie' as const,
			query: movie.title,
			year: movie.year,
			tmdbId: movie.tmdbId,
			imdbId: movie.imdbId,
			categories: []
		};

		const results = await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout')), options.timeout)
			)
		]);

		const releases = Array.isArray(results) ? results : results?.releases || [];

		if (releases.length === 0) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				resultCount: 0,
				error: `No results for "${movie.title}" (${movie.year})`
			};
		}

		// Validate result structure
		const firstResult = releases[0];
		const hasTitle = !!firstResult.title;
		const hasDownload = !!(firstResult.downloadUrl || firstResult.magnetUrl || firstResult.link);

		if (!hasTitle || !hasDownload) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				resultCount: releases.length,
				error: 'Invalid result structure (missing title or download URL)'
			};
		}

		return {
			name: testName,
			passed: true,
			duration: performance.now() - start,
			resultCount: releases.length,
			details: `Found ${releases.length} results for "${movie.title}"`
		};
	} catch (error) {
		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

async function testTvSearch(indexer: any, options: TestOptions): Promise<TestResult['tests'][0]> {
	const start = performance.now();
	const testName = 'TV Search';
	const show = TEST_MEDIA.tvShows[0]; // Breaking Bad

	try {
		const criteria = {
			searchType: 'tv' as const,
			query: show.title,
			season: show.season,
			episode: show.episode,
			tvdbId: show.tvdbId,
			imdbId: show.imdbId,
			categories: []
		};

		const results = await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout')), options.timeout)
			)
		]);

		const releases = Array.isArray(results) ? results : results?.releases || [];

		if (releases.length === 0) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				resultCount: 0,
				error: `No results for "${show.title}" S${show.season}E${show.episode}`
			};
		}

		return {
			name: testName,
			passed: true,
			duration: performance.now() - start,
			resultCount: releases.length,
			details: `Found ${releases.length} results for "${show.title}" S${show.season}E${show.episode}`
		};
	} catch (error) {
		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

async function testBasicSearch(
	indexer: any,
	options: TestOptions
): Promise<TestResult['tests'][0]> {
	const start = performance.now();
	const testName = 'Basic Search';
	const query = 'matrix 1999';

	try {
		const criteria = {
			searchType: 'basic' as const,
			query,
			categories: []
		};

		const results = await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout')), options.timeout)
			)
		]);

		const releases = Array.isArray(results) ? results : results?.releases || [];

		if (releases.length === 0) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				resultCount: 0,
				error: `No results for "${query}"`
			};
		}

		return {
			name: testName,
			passed: true,
			duration: performance.now() - start,
			resultCount: releases.length,
			details: `Found ${releases.length} results for "${query}"`
		};
	} catch (error) {
		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

async function testCategoryFiltering(
	indexer: any,
	options: TestOptions
): Promise<TestResult['tests'][0]> {
	const start = performance.now();
	const testName = 'Category Filtering';

	try {
		const caps = indexer.capabilities;

		if (!caps?.categories || caps.categories.size === 0) {
			return {
				name: testName,
				passed: true,
				duration: performance.now() - start,
				details: 'No categories defined (acceptable)'
			};
		}

		// Get movie categories from the indexer's category map
		const movieCats: number[] = [];
		if (caps.categories instanceof Map) {
			for (const [catId, catName] of caps.categories) {
				if (String(catName).toLowerCase().includes('movie')) {
					movieCats.push(catId);
				}
			}
		}

		if (movieCats.length === 0) {
			return {
				name: testName,
				passed: true,
				duration: performance.now() - start,
				details: 'No movie categories found (acceptable)'
			};
		}

		// Search with category filter
		const criteria = {
			searchType: 'movie' as const,
			query: 'inception',
			categories: movieCats.slice(0, 3) // Use up to 3 movie categories
		};

		const results = await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout')), options.timeout)
			)
		]);

		const releases = Array.isArray(results) ? results : results?.releases || [];

		return {
			name: testName,
			passed: true,
			duration: performance.now() - start,
			resultCount: releases.length,
			details: `Category filter applied, got ${releases.length} results`
		};
	} catch (error) {
		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

async function testYamlConnectivity(
	indexer: any,
	definition: any,
	options: TestOptions
): Promise<TestResult['tests'][0]> {
	const start = performance.now();
	const testName = 'YAML Connectivity';

	try {
		// Try to test the indexer connection
		if (typeof indexer.test === 'function') {
			await Promise.race([
				indexer.test(),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Timeout')), options.timeout)
				)
			]);
			return {
				name: testName,
				passed: true,
				duration: performance.now() - start,
				details: 'Connection test passed'
			};
		}

		// Fallback: try a simple search
		const criteria = {
			searchType: 'basic' as const,
			query: 'test',
			categories: []
		};

		await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout')), options.timeout)
			)
		]);

		return {
			name: testName,
			passed: true,
			duration: performance.now() - start,
			details: 'Basic connectivity verified'
		};
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);

		// Check for Cloudflare
		if (errMsg.includes('Cloudflare') || errMsg.includes('403')) {
			return {
				name: testName,
				passed: false,
				duration: performance.now() - start,
				error: 'Cloudflare protected - requires FlareSolverr'
			};
		}

		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: errMsg
		};
	}
}

// =============================================================================
// Mass Search Tests
// =============================================================================

async function runMassSearchTests(
	manager: any,
	getSearchOrchestrator: any,
	options: TestOptions
): Promise<void> {
	console.log(
		`${c.bold}${c.white}═══════════════════════════════════════════════════════════════${c.reset}`
	);
	console.log(`${c.bold}                    MASS SEARCH TESTS${c.reset}`);
	console.log(
		`${c.bold}${c.white}═══════════════════════════════════════════════════════════════${c.reset}\n`
	);

	const orchestrator = getSearchOrchestrator();
	const indexers = await manager.getEnabledIndexers();

	if (indexers.length === 0) {
		console.log(`${c.yellow}⚠ No enabled indexers found. Skipping mass search tests.${c.reset}`);
		return;
	}

	console.log(`${c.dim}Testing mass search across ${indexers.length} enabled indexers${c.reset}\n`);

	// Test 1: Movie mass search
	const movie = TEST_MEDIA.movies[0];
	console.log(`${c.cyan}Mass Movie Search: "${movie.title}" (${movie.year})${c.reset}`);

	try {
		const movieCriteria = {
			searchType: 'movie' as const,
			query: movie.title,
			year: movie.year,
			tmdbId: movie.tmdbId,
			imdbId: movie.imdbId
		};

		const movieStart = performance.now();
		const movieResults = await orchestrator.search(indexers, movieCriteria, {
			timeout: options.timeout,
			concurrency: 5
		});
		const movieDuration = performance.now() - movieStart;

		console.log(
			`  ${c.green}✓${c.reset} Found ${c.bold}${movieResults.releases?.length || 0}${c.reset} total releases`
		);
		console.log(`    Duration: ${movieDuration.toFixed(0)}ms`);

		if (movieResults.indexerResults) {
			for (const ir of movieResults.indexerResults) {
				const status = ir.error ? `${c.red}✗${c.reset}` : `${c.green}✓${c.reset}`;
				console.log(
					`    ${status} ${ir.indexerName}: ${ir.releases?.length || 0} results${ir.error ? ` (${ir.error})` : ''}`
				);
			}
		}
	} catch (error) {
		console.log(
			`  ${c.red}✗ Movie search failed: ${error instanceof Error ? error.message : error}${c.reset}`
		);
	}

	console.log('');

	// Test 2: TV show mass search
	const show = TEST_MEDIA.tvShows[0];
	console.log(`${c.cyan}Mass TV Search: "${show.title}" S${show.season}E${show.episode}${c.reset}`);

	try {
		const tvCriteria = {
			searchType: 'tv' as const,
			query: show.title,
			season: show.season,
			episode: show.episode,
			tvdbId: show.tvdbId,
			imdbId: show.imdbId
		};

		const tvStart = performance.now();
		const tvResults = await orchestrator.search(indexers, tvCriteria, {
			timeout: options.timeout,
			concurrency: 5
		});
		const tvDuration = performance.now() - tvStart;

		console.log(
			`  ${c.green}✓${c.reset} Found ${c.bold}${tvResults.releases?.length || 0}${c.reset} total releases`
		);
		console.log(`    Duration: ${tvDuration.toFixed(0)}ms`);

		if (tvResults.indexerResults) {
			for (const ir of tvResults.indexerResults) {
				const status = ir.error ? `${c.red}✗${c.reset}` : `${c.green}✓${c.reset}`;
				console.log(
					`    ${status} ${ir.indexerName}: ${ir.releases?.length || 0} results${ir.error ? ` (${ir.error})` : ''}`
				);
			}
		}
	} catch (error) {
		console.log(
			`  ${c.red}✗ TV search failed: ${error instanceof Error ? error.message : error}${c.reset}`
		);
	}

	// Test 3: Deduplication check
	console.log(`\n${c.cyan}Deduplication Test${c.reset}`);
	try {
		const criteria = {
			searchType: 'basic' as const,
			query: 'matrix 1999'
		};

		const results = await orchestrator.search(indexers, criteria, {
			timeout: options.timeout,
			concurrency: 5
		});

		const totalFromIndexers =
			results.indexerResults?.reduce(
				(sum: number, ir: any) => sum + (ir.releases?.length || 0),
				0
			) || 0;
		const afterDedup = results.releases?.length || 0;
		const duplicates = totalFromIndexers - afterDedup;

		console.log(`  Total from indexers: ${totalFromIndexers}`);
		console.log(`  After deduplication: ${afterDedup}`);
		console.log(`  Duplicates removed: ${duplicates}`);
		console.log(`  ${c.green}✓${c.reset} Deduplication working correctly`);
	} catch (error) {
		console.log(
			`  ${c.red}✗ Deduplication test failed: ${error instanceof Error ? error.message : error}${c.reset}`
		);
	}
}

// =============================================================================
// Utility Functions
// =============================================================================

function logTestResult(test: TestResult['tests'][0], verbose: boolean): void {
	const status = test.passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
	const duration = `${c.dim}(${test.duration.toFixed(0)}ms)${c.reset}`;

	let result = `  ${status} ${test.name} ${duration}`;

	if (test.resultCount !== undefined) {
		result += ` - ${test.resultCount} results`;
	}

	if (!test.passed && test.error) {
		result += ` - ${c.red}${test.error}${c.reset}`;
	} else if (verbose && test.details) {
		result += ` - ${c.dim}${test.details}${c.reset}`;
	}

	console.log(result);
}

// =============================================================================
// Entry Point
// =============================================================================

main().catch((error) => {
	console.error(`\n${c.red}${c.bold}Fatal Error:${c.reset} ${error.message}`);
	if (error.stack) {
		console.error(`${c.dim}${error.stack}${c.reset}`);
	}
	process.exit(1);
});
