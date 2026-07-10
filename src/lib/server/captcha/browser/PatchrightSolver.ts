/**
 * Browser Solver
 *
 * Backend-agnostic browser fetch and challenge-solve logic. Accepts any
 * BaseBrowserManager implementation (Patchright or Playwright).
 *
 * Design contract:
 * - Do not attempt to interact with Turnstile widgets or inject challenge tokens.
 * - The only valid success signal is a verified non-challenge response from the
 *   target URL (correct HTTP status + no challenge detected).
 * - At most one verification navigation per call — no retry loops.
 * - A detected challenge is always returned as challenge_required, never retried.
 */

import type { Page } from 'playwright-core';
import { createChildLogger } from '$lib/logging';
import type {
	BrowserFailureKind,
	BrowserFetchRequest,
	BrowserFetchResult,
	ChallengeDetectionResult,
	ChallengeType,
	SolveRequest,
	SolveResult
} from '../types';
import { BaseBrowserManager, type ManagedBrowser } from './BaseBrowserManager';
import { getPatchrightManager } from './PatchrightManager';
import { detectChallengeFromPage } from '../detection/ChallengeDetector';

const logger = createChildLogger({ logDomain: 'indexers' as const });

const FALLBACK_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

/**
 * Returns true if the URL is a Cloudflare challenge URL.
 * CF appends __cf_chl_rt_tk when serving an interactive managed challenge.
 */
function isChallengeUrl(url: string): boolean {
	return url.includes('__cf_chl_rt_tk') || url.includes('challenges.cloudflare.com/cdn-cgi');
}

/**
 * Navigate to targetUrl and verify the response is real protected content.
 *
 * Returns success only when:
 * - HTTP status is 2xx or 3xx
 * - No challenge detected by ChallengeDetector
 * - URL does not contain a CF challenge token
 *
 * Never retries. One navigation, one answer.
 */
async function verifyProtectedPage(
	page: Page,
	targetUrl: string,
	timeoutMs: number
): Promise<{
	success: boolean;
	url: string;
	status: number;
	body: string;
	headers: Record<string, string>;
	challenge: ChallengeDetectionResult;
}> {
	const startTime = Date.now();

	// Initial navigation — may land on CF challenge page (status 403/503)
	let lastResponse = await page
		.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
		.catch(() => null);

	// If patchright's patches pass CF's JS challenge, CF submits a form and
	// redirects to the real page. This redirect is a separate navigation that
	// fires AFTER the initial domcontentloaded. Wait through it if a challenge
	// is detected on the first landing.
	const initialChallenge = await detectChallengeFromPage(page);
	if (initialChallenge.detected || isChallengeUrl(page.url())) {
		const elapsed = Date.now() - startTime;
		const remaining = timeoutMs - elapsed;
		if (remaining > 2000) {
			// CF typically takes 3-6s to pass its JS challenge and redirect.
			// Wait for up to two navigations: challenge → CF clearance URL → real page.
			const nav1 = await page
				.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: remaining })
				.catch(() => null);
			if (nav1) lastResponse = nav1;
			const elapsed2 = Date.now() - startTime;
			const remaining2 = timeoutMs - elapsed2;
			if (remaining2 > 1000) {
				const nav2 = await page
					.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: remaining2 })
					.catch(() => null);
				if (nav2) lastResponse = nav2;
			}
		}
	}

	const status = lastResponse?.status() ?? 0;
	const headers = lastResponse?.headers() ?? {};
	const body = await page.content().catch(() => '');
	const challenge = await detectChallengeFromPage(page);
	const url = page.url();

	const success =
		status >= 200 && status < 400 && !challenge.detected && !isChallengeUrl(url);

	return { success, url, status, headers, body, challenge };
}

/**
 * Log a structured failure diagnostic. Cookie values, proxy credentials, and
 * raw HTML are intentionally excluded.
 */
async function logVerificationFailure(
	page: Page,
	targetUrl: string,
	verification: Awaited<ReturnType<typeof verifyProtectedPage>>,
	cookies: Array<{ name: string }>,
	startTime: number
): Promise<void> {
	const title = await page.title().catch(() => '');
	logger.warn({
		targetHost: new URL(targetUrl).hostname,
		finalUrl: verification.url,
		status: verification.status,
		title,
		detectorType: verification.challenge.type,
		detectorConfidence: verification.challenge.confidence,
		cfRay: verification.headers['cf-ray'],
		cfMitigated: verification.headers['cf-mitigated'],
		cookieNames: cookies.map((c) => c.name),
		elapsedMs: Date.now() - startTime
	}, '[BrowserSolver] Verification failed');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a URL through a managed browser, bypassing TLS fingerprinting.
 * Pre-populate the session with any provided cookies so domain sessions can
 * be reused across calls without re-solving challenges.
 */
export async function browserFetch(
	request: BrowserFetchRequest,
	config: { headless: boolean; timeoutSeconds: number },
	manager: BaseBrowserManager = getPatchrightManager()
): Promise<BrowserFetchResult> {
	const startTime = Date.now();
	let managed: ManagedBrowser | null = null;

	const timeout = (request.timeout ?? config.timeoutSeconds) * 1000;

	try {
		const domain = new URL(request.url).hostname;
		managed = await manager.createBrowserForDomain(domain, {
			headless: config.headless,
			proxy: request.proxy
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		logger.error({ err: error }, '[BrowserSolver] Failed to create browser');
		return makeFetchError(request.url, msg, 'launch_failed', Date.now() - startTime);
	}

	try {
		const { page, context } = managed;

		if (request.cookies?.length) {
			await manager.addCookies(context, request.cookies);
		}

		if (request.method === 'POST' && request.body) {
			await page.route('**/*', async (route, req) => {
				if (req.url() === request.url && req.method() === 'GET') {
					await route.continue({
						method: 'POST',
						postData: request.body,
						headers: {
							...req.headers(),
							'Content-Type': request.contentType ?? 'application/x-www-form-urlencoded'
						}
					});
				} else {
					await route.continue();
				}
			});
		}

		const verification = await verifyProtectedPage(page, request.url, timeout);

		if (!verification.success) {
			const cookies = await manager.extractCookies(context, [request.url]);
			await logVerificationFailure(page, request.url, verification, cookies, startTime);

			const failureKind: BrowserFailureKind = verification.challenge.detected
				? 'challenge_required'
				: 'target_rejected';
			const msg = verification.challenge.detected
				? `Cloudflare challenge returned for ${new URL(request.url).hostname} (${verification.challenge.type})`
				: `Target returned ${verification.status} without a resolvable challenge`;
			return makeFetchError(request.url, msg, failureKind, Date.now() - startTime);
		}

		const userAgent = await page
			.evaluate(() => navigator.userAgent)
			.catch(() => FALLBACK_USER_AGENT);
		const cookies = await manager.extractCookies(context, [verification.url]);

		logger.debug(
			{
				url: request.url,
				finalUrl: verification.url,
				status: verification.status,
				bodyLength: verification.body.length,
				timeMs: Date.now() - startTime
			},
			'[BrowserSolver] Browser fetch completed'
		);

		return {
			success: true,
			body: verification.body,
			url: verification.url,
			status: verification.status,
			headers: verification.headers,
			cookies,
			userAgent,
			timeMs: Date.now() - startTime
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		logger.error({ err: error }, '[BrowserSolver] Browser fetch error');
		return makeFetchError(request.url, msg, 'unknown', Date.now() - startTime);
	} finally {
		if (managed) await manager.closeBrowser(managed);
	}
}

/**
 * Navigate to a URL with the goal of obtaining session cookies (e.g. cf_clearance).
 * Patchright's fingerprint patches handle CF's non-interactive JS challenge
 * automatically — if the challenge resolves before domcontentloaded fires on the
 * real page, the navigation completes cleanly. If the challenge page is still
 * present after navigation, this is a clean failure: challenge_required.
 */
export async function solveChallenge(
	request: SolveRequest,
	config: { headless: boolean; timeoutSeconds: number },
	manager: BaseBrowserManager = getPatchrightManager()
): Promise<SolveResult> {
	const startTime = Date.now();
	let managed: ManagedBrowser | null = null;

	try {
		const domain = new URL(request.url).hostname;
		managed = await manager.createBrowserForDomain(domain, {
			headless: config.headless,
			proxy: request.proxy
		});

		const { page, context } = managed;
		const timeout = (request.timeout ?? config.timeoutSeconds) * 1000;

		if (request.cookies?.length) {
			await manager.addCookies(context, request.cookies);
		}

		const userAgent = await page
			.evaluate(() => navigator.userAgent)
			.catch(() => FALLBACK_USER_AGENT);

		const remaining = Math.max(1000, timeout - (Date.now() - startTime));
		const verification = await verifyProtectedPage(page, request.url, remaining);

		if (!verification.success) {
			const cookies = await manager.extractCookies(context, [request.url]);
			await logVerificationFailure(page, request.url, verification, cookies, startTime);

			const failureKind: BrowserFailureKind = verification.challenge.detected
				? 'challenge_required'
				: 'target_rejected';
			return {
				success: false,
				cookies: [],
				userAgent,
				solveTimeMs: Date.now() - startTime,
				challengeType: verification.challenge.type,
				error: failureKind === 'challenge_required'
					? `Challenge not bypassed for ${new URL(request.url).hostname} (${verification.challenge.type}): challenge still present after navigation`
					: `Target returned ${verification.status} for ${new URL(request.url).hostname}`
			};
		}

		const cookies = await manager.extractCookies(context);
		logger.info(
			{ domain, timeMs: Date.now() - startTime },
			'[BrowserSolver] Challenge solved'
		);

		return {
			success: true,
			cookies,
			userAgent,
			solveTimeMs: Date.now() - startTime,
			challengeType: verification.challenge.type,
			response: { url: verification.url, status: verification.status }
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		logger.error({ err: error }, '[BrowserSolver] Error solving challenge');
		return {
			success: false,
			cookies: [],
			userAgent: '',
			solveTimeMs: Date.now() - startTime,
			challengeType: 'unknown',
			error: msg
		};
	} finally {
		if (managed) await manager.closeBrowser(managed);
	}
}

/**
 * Test if a URL presents a challenge without attempting to solve it.
 */
export async function testForChallenge(
	url: string,
	config: { headless: boolean },
	manager: BaseBrowserManager = getPatchrightManager()
): Promise<{ hasChallenge: boolean; type: ChallengeType; confidence: number }> {
	let managed: ManagedBrowser | null = null;

	try {
		const domain = new URL(url).hostname;
		managed = await manager.createBrowserForDomain(domain, { headless: config.headless });
		const response = await managed.page
			.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' })
			.catch(() => null);
		if (!response) return { hasChallenge: false, type: 'unknown', confidence: 0 };
		const result = await detectChallengeFromPage(managed.page);
		return { hasChallenge: result.detected, type: result.type, confidence: result.confidence };
	} catch (error) {
		logger.warn({ url, err: error }, '[BrowserSolver] Error testing for challenge');
		return { hasChallenge: false, type: 'unknown', confidence: 0 };
	} finally {
		if (managed) await manager.closeBrowser(managed);
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeFetchError(
	url: string,
	error: string,
	failureKind: BrowserFailureKind,
	timeMs: number
): BrowserFetchResult {
	return {
		success: false,
		body: '',
		url,
		status: 0,
		headers: {},
		cookies: [],
		userAgent: '',
		error,
		timeMs,
		failureKind
	};
}
