/**
 * BrowserSolver Tests
 *
 * Tests for the browser-fetch and challenge-solve logic.
 * All challenge state is expressed through detectChallengeFromPage — not title
 * polling, cookies, or URL patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserContext, Page, Cookie, Response as BrowserResponse } from 'playwright-core';
import type { ManagedBrowser } from './BaseBrowserManager';
import type { BaseBrowserManager } from './BaseBrowserManager';
import type { ChallengeDetectionResult } from '../types';

// Mock ChallengeDetector
vi.mock('../detection/ChallengeDetector', () => ({
	detectChallengeFromPage: vi.fn()
}));

// Mock logger
const mockLogger = {
	info: vi.fn(),
	debug: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	child: vi.fn().mockReturnThis()
};

vi.mock('$lib/logging', () => ({
	logger: mockLogger,
	createChildLogger: vi.fn(() => mockLogger)
}));

// Mock PatchrightManager (used as default when no manager passed)
const mockPatchrightManager = {
	createBrowserForDomain: vi.fn(),
	closeBrowser: vi.fn(),
	extractCookies: vi.fn(),
	addCookies: vi.fn(),
	browserAvailable: vi.fn().mockReturnValue(true),
	waitForAvailabilityCheck: vi.fn().mockResolvedValue(undefined),
	getAvailabilityError: vi.fn().mockReturnValue(undefined)
};

vi.mock('./PatchrightManager', () => ({
	getPatchrightManager: vi.fn(() => mockPatchrightManager)
}));

const { solveChallenge, testForChallenge, browserFetch } = await import('./PatchrightSolver');
const { detectChallengeFromPage } = await import('../detection/ChallengeDetector');

function createMockPage(): Page {
	const mockContext = {
		cookies: vi.fn().mockResolvedValue([]),
		addCookies: vi.fn().mockResolvedValue(undefined)
	} as unknown as BrowserContext;

	return {
		goto: vi.fn().mockResolvedValue(createMockResponse(200)),
		title: vi.fn().mockResolvedValue('Normal Page'),
		content: vi.fn().mockResolvedValue('<html><body>Content</body></html>'),
		url: vi.fn().mockReturnValue('https://example.com'),
		evaluate: vi.fn().mockResolvedValue(
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
		),
		context: vi.fn().mockReturnValue(mockContext),
		frames: vi.fn().mockReturnValue([]),
		route: vi.fn().mockResolvedValue(undefined),
		on: vi.fn(),
		waitForNavigation: vi.fn().mockResolvedValue(null)
	} as unknown as Page;
}

function createMockResponse(status = 200): BrowserResponse {
	return {
		status: vi.fn().mockReturnValue(status),
		headers: vi.fn().mockReturnValue({ 'content-type': 'text/html' }),
		url: vi.fn().mockReturnValue('https://example.com')
	} as unknown as BrowserResponse;
}

function createMockManagedBrowser(): ManagedBrowser {
	const page = createMockPage();
	return {
		browser: { close: vi.fn() },
		context: page.context(),
		page,
		createdAt: new Date(),
		isClosed: false,
		id: 'test-id'
	} as unknown as ManagedBrowser;
}

function createMockManager(managed: ManagedBrowser): BaseBrowserManager {
	return {
		createBrowserForDomain: vi.fn().mockResolvedValue(managed),
		closeBrowser: vi.fn().mockResolvedValue(undefined),
		extractCookies: vi.fn().mockResolvedValue([]),
		addCookies: vi.fn().mockResolvedValue(undefined),
		browserAvailable: vi.fn().mockReturnValue(true),
		waitForAvailabilityCheck: vi.fn().mockResolvedValue(undefined),
		getAvailabilityError: vi.fn().mockReturnValue(undefined)
	} as unknown as BaseBrowserManager;
}

const noChallenge: ChallengeDetectionResult = { detected: false, type: 'unknown', confidence: 0 };
const cfChallenge: ChallengeDetectionResult = {
	detected: true,
	type: 'cloudflare',
	confidence: 0.95
};

describe('BrowserSolver', () => {
	let managed: ManagedBrowser;
	let manager: BaseBrowserManager;

	beforeEach(() => {
		vi.clearAllMocks();
		managed = createMockManagedBrowser();
		manager = createMockManager(managed);
		(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(noChallenge);
	});

	describe('solveChallenge', () => {
		it('should return success when navigation lands on clean page', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(
				createMockResponse(200)
			);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(true);
		});

		it('should extract cookies on success', async () => {
			const testCookies: Cookie[] = [
				{
					name: 'session', value: 'abc123', domain: 'example.com',
					path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax'
				}
			];
			(manager.extractCookies as ReturnType<typeof vi.fn>).mockResolvedValue(testCookies);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.cookies).toEqual(testCookies);
		});

		it('should return challenge_required when CF challenge detected', async () => {
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(cfChallenge);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(
				createMockResponse(503)
			);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
			expect(result.challengeType).toBe('cloudflare');
			expect(result.error).toContain('Challenge not bypassed');
		});

		it('should not treat cf_clearance cookie as a success signal', async () => {
			// Even with cf_clearance present, if the page still shows a challenge → failure
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(cfChallenge);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(503));
			const cfCookie: Cookie = {
				name: 'cf_clearance', value: 'test123', domain: 'example.com',
				path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None'
			};
			(managed.page.context().cookies as ReturnType<typeof vi.fn>).mockResolvedValue([cfCookie]);
			(manager.extractCookies as ReturnType<typeof vi.fn>).mockResolvedValue([cfCookie]);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
		});

		it('should return error when browser launch fails', async () => {
			(manager.createBrowserForDomain as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Launch failed')
			);

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Launch failed');
		});

		it('should always close browser after solve', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(manager.closeBrowser).toHaveBeenCalledWith(managed);
		});

		it('should add provided cookies to context before navigating', async () => {
			const requestCookies: Cookie[] = [
				{
					name: 'existing', value: 'cookie', domain: 'example.com',
					path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax'
				}
			];
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			await solveChallenge(
				{ url: 'https://example.com', cookies: requestCookies },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(manager.addCookies).toHaveBeenCalledWith(managed.context, requestCookies);
		});

		it('should return real HTTP status from final navigation', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.response?.status).toBe(200);
		});

		it('should use Chrome fallback user agent when evaluate fails', async () => {
			(managed.page.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Context destroyed')
			);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			const result = await solveChallenge(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.userAgent).toContain('Chrome');
		});

		it('should pass proxy config to manager', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			await solveChallenge(
				{
					url: 'https://example.com',
					proxy: { url: 'http://proxy:8080', username: 'user', password: 'pass' }
				},
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(manager.createBrowserForDomain).toHaveBeenCalledWith(
				'example.com',
				expect.objectContaining({
					proxy: { url: 'http://proxy:8080', username: 'user', password: 'pass' }
				})
			);
		});
	});

	describe('browserFetch', () => {
		it('should return body and status on success', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));
			(managed.page.content as ReturnType<typeof vi.fn>).mockResolvedValue('<html>Real content</html>');

			const result = await browserFetch(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(true);
			expect(result.body).toBe('<html>Real content</html>');
			expect(result.status).toBe(200);
		});

		it('should return challenge_required failureKind when challenge detected', async () => {
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(cfChallenge);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(503));

			const result = await browserFetch(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
			expect(result.failureKind).toBe('challenge_required');
		});

		it('should not return challenge page as successful body', async () => {
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(cfChallenge);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(503));
			(managed.page.content as ReturnType<typeof vi.fn>).mockResolvedValue(
				'<html><title>Just a moment...</title></html>'
			);

			const result = await browserFetch(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
			expect(result.body).toBe('');
		});

		it('should seed browser session with provided cookies', async () => {
			const sessionCookies: Cookie[] = [
				{
					name: 'cf_clearance', value: 'abc', domain: 'example.com',
					path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None'
				}
			];
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			await browserFetch(
				{ url: 'https://example.com', cookies: sessionCookies },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(manager.addCookies).toHaveBeenCalledWith(managed.context, sessionCookies);
		});

		it('should return target_rejected when 4xx status with no challenge', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(404));

			const result = await browserFetch(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
			expect(result.failureKind).toBe('target_rejected');
		});

		it('should return launch_failed when browser creation fails', async () => {
			(manager.createBrowserForDomain as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Patchright not available')
			);

			const result = await browserFetch(
				{ url: 'https://example.com' },
				{ headless: true, timeoutSeconds: 60 },
				manager
			);

			expect(result.success).toBe(false);
			expect(result.failureKind).toBe('launch_failed');
		});

		it('should always close browser', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));
			await browserFetch({ url: 'https://example.com' }, { headless: true, timeoutSeconds: 60 }, manager);
			expect(manager.closeBrowser).toHaveBeenCalledWith(managed);
		});
	});

	describe('testForChallenge', () => {
		it('should return hasChallenge false for normal page', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(200));

			const result = await testForChallenge('https://example.com', { headless: true }, manager);

			expect(result.hasChallenge).toBe(false);
		});

		it('should return hasChallenge true when challenge detected', async () => {
			(detectChallengeFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(cfChallenge);
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(createMockResponse(503));

			const result = await testForChallenge('https://example.com', { headless: true }, manager);

			expect(result.hasChallenge).toBe(true);
			expect(result.type).toBe('cloudflare');
			expect(result.confidence).toBe(0.95);
		});

		it('should return hasChallenge false when no response', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await testForChallenge('https://example.com', { headless: true }, manager);

			expect(result.hasChallenge).toBe(false);
		});

		it('should return hasChallenge false on navigation error', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));

			const result = await testForChallenge('https://example.com', { headless: true }, manager);

			expect(result.hasChallenge).toBe(false);
		});

		it('should always close browser', async () => {
			(managed.page.goto as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('err'));
			await testForChallenge('https://example.com', { headless: true }, manager);
			expect(manager.closeBrowser).toHaveBeenCalledWith(managed);
		});
	});
});
