/**
 * Test script for Cloudflare bypass using the captcha solver.
 *
 * Usage: npx tsx scripts/test-cloudflare-bypass.ts [url...] [--no-browser-fetch]
 *
 * Default URLs: https://2captcha.com/demo, https://nowsecure.nl
 */

import 'dotenv/config';
import { getCaptchaSolver } from '../src/lib/server/captcha';
import { createIndexerHttp } from '../src/lib/server/indexers/http/IndexerHttp';

const DEFAULT_TEST_URLS = ['https://2captcha.com/demo', 'https://nowsecure.nl'];
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const TEST_URLS = args.filter((arg) => !arg.startsWith('--'));
const SHOULD_RUN_BROWSER_FETCH = !flags.has('--no-browser-fetch');
const TARGET_URLS = TEST_URLS.length > 0 ? TEST_URLS : DEFAULT_TEST_URLS;

async function main() {
	console.log('='.repeat(60));
	console.log('Cloudflare Bypass Test');
	console.log('='.repeat(60));
	console.log(`Target URLs: ${TARGET_URLS.join(', ')}`);
	console.log(`Browser fetch enabled: ${SHOULD_RUN_BROWSER_FETCH}`);
	console.log('');

	// Initialize the captcha solver
	console.log('[1/4] Initializing captcha solver...');
	const solver = getCaptchaSolver();
	solver.start();

	// Wait for solver to be ready
	const startTime = Date.now();
	while (solver.status !== 'ready' && solver.status !== 'error') {
		if (Date.now() - startTime > 30000) {
			console.error('Timeout waiting for captcha solver to initialize');
			process.exit(1);
		}
		await new Promise((r) => setTimeout(r, 100));
	}

	if (solver.status === 'error') {
		console.error('Captcha solver failed to initialize');
		const health = solver.getHealth();
		console.error('Health:', JSON.stringify(health, null, 2));
		process.exit(1);
	}

	console.log(`    Status: ${solver.status}`);
	console.log(`    Available: ${solver.isAvailable()}`);
	console.log('');

	// Check health
	const health = solver.getHealth();
	console.log('[2/4] Captcha solver health:');
	console.log(`    Browser available: ${health.browserAvailable}`);
	console.log(`    Status: ${health.status}`);
	if (health.error) {
		console.log(`    Error: ${health.error}`);
	}
	console.log('');

	for (const url of TARGET_URLS) {
		console.log(`[3/4] Testing for Cloudflare challenge (${url})...`);
		try {
			const testResult = await solver.test(url);
			console.log(`    Has challenge: ${testResult.hasChallenge}`);
			console.log(`    Type: ${testResult.type}`);
			console.log(`    Confidence: ${(testResult.confidence * 100).toFixed(1)}%`);
			console.log('');

			if (!testResult.hasChallenge) {
				console.log('No Cloudflare challenge detected. Attempting direct fetch...');
			}
		} catch (error) {
			console.error('    Error testing for challenge:', error);
		}

		if (!SHOULD_RUN_BROWSER_FETCH) {
			console.log('Skipping IndexerHttp fetch (browser fallback disabled).');
			console.log('');
			continue;
		}

		console.log(`[4/4] Fetching page via IndexerHttp (with automatic CF bypass) for ${url}...`);
		const http = createIndexerHttp({
			indexerId: 'test-cloudflare',
			indexerName: 'Test Cloudflare',
			baseUrl: url,
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			defaultTimeout: 120000 // 2 minutes for CF solving
		});

		try {
			const fetchStart = Date.now();
			const response = await http.get(url);
			const fetchTime = Date.now() - fetchStart;

			console.log('');
			console.log('SUCCESS!');
			console.log('-'.repeat(40));
			console.log(`    Status: ${response.status}`);
			console.log(`    Final URL: ${response.url}`);
			console.log(`    Body length: ${response.body.length} bytes`);
			console.log(`    Time taken: ${fetchTime}ms`);
			console.log('');

			// Extract title from response
			const titleMatch = response.body.match(/<title>([^<]+)<\/title>/i);
			if (titleMatch) {
				console.log(`    Page title: ${titleMatch[1]}`);
			}

			// Check if this looks like a successful page
			if (
				response.body.includes('torrent') ||
				response.body.includes('search') ||
				response.body.includes('nowSecure') ||
				response.body.includes('nowsecure')
			) {
				console.log('    Content looks valid (contains expected keywords)');
			} else if (response.body.includes('Just a moment')) {
				console.log('    WARNING: Still seeing Cloudflare challenge page!');
			}

			// Show first few links if found
			const linkMatches = response.body.match(/href="\/torrent\/[^"]+"/g);
			if (linkMatches && linkMatches.length > 0) {
				console.log('');
				console.log('    Sample torrent links found:');
				linkMatches.slice(0, 3).forEach((link) => {
					console.log(`      ${link}`);
				});
			}
		} catch (error) {
			console.error('');
			console.error('FAILED!');
			console.error('-'.repeat(40));
			console.error(`    Error: ${error}`);
			if (error instanceof Error) {
				console.error(`    Stack: ${error.stack}`);
			}
		}

		console.log('');
	}

	// Show final stats
	console.log('');
	console.log('Solver stats:');
	const stats = solver.getStats();
	console.log(`    Solve attempts: ${stats.totalAttempts}`);
	console.log(`    Solve successes: ${stats.successCount}`);
	console.log(`    Solve failures: ${stats.failureCount}`);
	console.log(`    Fetch attempts: ${stats.fetchAttempts}`);
	console.log(`    Fetch successes: ${stats.fetchSuccessCount}`);
	console.log(`    Fetch failures: ${stats.fetchFailureCount}`);
	console.log(`    Cache hits: ${stats.cacheHits}`);
	console.log(`    Avg solve time: ${stats.avgSolveTimeMs}ms`);
	console.log(`    Avg fetch time: ${stats.avgFetchTimeMs}ms`);
	if (!stats.fetchAttempts && SHOULD_RUN_BROWSER_FETCH) {
		console.log('    NOTE: No browser fetches recorded; Cloudflare bypass may not have triggered.');
	}

	// Cleanup
	console.log('');
	console.log('Shutting down...');
	await solver.stop();
	console.log('Done.');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
