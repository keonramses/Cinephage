/**
 * CaptchaSolver Tests
 *
 * Tests for the main captcha solver service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SolveResult, CaptchaSolverConfig } from './types';

// Mock settings service
const mockConfig: CaptchaSolverConfig = {
	enabled: true,
	timeoutSeconds: 60,
	cacheTtlSeconds: 3600,
	headless: true,
	browserBackend: 'patchright',
	fallbackToPlaywright: false
};

vi.mock('./CaptchaSolverSettings', () => ({
	captchaSolverSettingsService: {
		getConfig: vi.fn(() => ({ ...mockConfig }))
	}
}));

// Mock solver functions
vi.mock('./browser/PatchrightSolver', () => ({
	solveChallenge: vi.fn(),
	testForChallenge: vi.fn(),
	browserFetch: vi.fn()
}));

// Mock Patchright manager
const mockPatchrightManager = {
	browserAvailable: vi.fn(() => true),
	waitForAvailabilityCheck: vi.fn().mockResolvedValue(undefined),
	getAvailabilityError: vi.fn(() => undefined)
};

vi.mock('./browser/PatchrightManager', () => ({
	getPatchrightManager: vi.fn(() => mockPatchrightManager),
	shutdownPatchrightManager: vi.fn().mockResolvedValue(undefined)
}));

// Mock Playwright manager (fallback)
const mockPlaywrightManager = {
	browserAvailable: vi.fn(() => true),
	waitForAvailabilityCheck: vi.fn().mockResolvedValue(undefined),
	getAvailabilityError: vi.fn(() => undefined)
};

vi.mock('./browser/PlaywrightManager', () => ({
	getPlaywrightManager: vi.fn(() => mockPlaywrightManager),
	shutdownPlaywrightManager: vi.fn().mockResolvedValue(undefined)
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

// Import after mocking
const { CaptchaSolver, getCaptchaSolver } = await import('./CaptchaSolver');
const { solveChallenge, testForChallenge, browserFetch } = await import(
	'./browser/PatchrightSolver'
);
const { captchaSolverSettingsService } = await import('./CaptchaSolverSettings');

async function waitForStatus(
	solver: InstanceType<typeof CaptchaSolver>,
	status: 'pending' | 'starting' | 'ready' | 'error',
	timeoutMs = 1000
): Promise<void> {
	const start = Date.now();
	while (solver.status !== status) {
		if (Date.now() - start > timeoutMs) {
			throw new Error(`Timeout waiting for status '${status}', current: '${solver.status}'`);
		}
		await new Promise((resolve) => setImmediate(resolve));
	}
}

async function startAndWaitReady(solver: InstanceType<typeof CaptchaSolver>): Promise<void> {
	solver.start();
	await waitForStatus(solver, 'ready');
}

describe('CaptchaSolver', () => {
	let solver: InstanceType<typeof CaptchaSolver>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockPatchrightManager.browserAvailable.mockReturnValue(true);
		mockPatchrightManager.waitForAvailabilityCheck.mockResolvedValue(undefined);
		mockPatchrightManager.getAvailabilityError.mockReturnValue(undefined);
		mockPlaywrightManager.browserAvailable.mockReturnValue(true);
		mockPlaywrightManager.waitForAvailabilityCheck.mockResolvedValue(undefined);

		(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
			...mockConfig
		});

		(solveChallenge as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			cookies: [
				{
					name: 'cf_clearance',
					value: 'test',
					domain: 'example.com',
					path: '/',
					expires: -1,
					httpOnly: true,
					secure: true,
					sameSite: 'None'
				}
			],
			userAgent: 'Mozilla/5.0 (Test)',
			solveTimeMs: 5000,
			challengeType: 'cloudflare'
		} as SolveResult);

		(testForChallenge as ReturnType<typeof vi.fn>).mockResolvedValue({
			hasChallenge: true,
			type: 'cloudflare',
			confidence: 0.95
		});

		solver = new CaptchaSolver();
	});

	afterEach(async () => {
		if (solver.status === 'ready' || solver.status === 'starting') {
			await solver.stop();
		}
	});

	describe('Service lifecycle', () => {
		it('should start with pending status', () => {
			expect(solver.status).toBe('pending');
		});

		it('should transition to starting then ready', async () => {
			solver.start();
			expect(solver.status).toBe('starting');
			await waitForStatus(solver, 'ready');
			expect(solver.status).toBe('ready');
		});

		it('should not restart if already ready', async () => {
			await startAndWaitReady(solver);
			solver.start();
			expect(mockPatchrightManager.waitForAvailabilityCheck).toHaveBeenCalledTimes(1);
		});

		it('should transition to error on initialization failure', async () => {
			mockPatchrightManager.waitForAvailabilityCheck.mockRejectedValue(
				new Error('Browser init failed')
			);
			solver.start();
			await waitForStatus(solver, 'error');
			expect(solver.status).toBe('error');
		});

		it('should stop and reset to pending', async () => {
			await startAndWaitReady(solver);
			await solver.stop();
			expect(solver.status).toBe('pending');
		});
	});

	describe('solve', () => {
		beforeEach(async () => {
			await startAndWaitReady(solver);
		});

		it('should return error when disabled', async () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				enabled: false
			});
			const result = await solver.solve({ url: 'https://example.com' });
			expect(result.success).toBe(false);
			expect(result.error).toBe('Captcha solver is disabled');
		});

		it('should return cached result when available', async () => {
			await solver.solve({ url: 'https://example.com' });
			const result = await solver.solve({ url: 'https://example.com' });
			expect(result.success).toBe(true);
			expect(result.solveTimeMs).toBe(0);
			expect(solveChallenge).toHaveBeenCalledTimes(1);
		});

		it('should prevent duplicate concurrent solves for same domain', async () => {
			const [r1, r2] = await Promise.all([
				solver.solve({ url: 'https://example.com/page1' }),
				solver.solve({ url: 'https://example.com/page2' })
			]);
			expect(r1.success).toBe(true);
			expect(r2.success).toBe(true);
			expect(solveChallenge).toHaveBeenCalledTimes(1);
		});

		it('should allow concurrent solves for different domains', async () => {
			await Promise.all([
				solver.solve({ url: 'https://example.com' }),
				solver.solve({ url: 'https://other.com' })
			]);
			expect(solveChallenge).toHaveBeenCalledTimes(2);
		});

		it('should update stats on successful solve', async () => {
			await solver.solve({ url: 'https://example.com' });
			const stats = solver.getStats();
			expect(stats.totalAttempts).toBe(1);
			expect(stats.successCount).toBe(1);
			expect(stats.failureCount).toBe(0);
		});

		it('should update stats on failed solve', async () => {
			(solveChallenge as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: false,
				cookies: [],
				userAgent: '',
				solveTimeMs: 5000,
				challengeType: 'cloudflare',
				error: 'Timeout'
			} as SolveResult);
			await solver.solve({ url: 'https://example.com' });
			const stats = solver.getStats();
			expect(stats.totalAttempts).toBe(1);
			expect(stats.successCount).toBe(0);
			expect(stats.failureCount).toBe(1);
			expect(stats.lastError).toBe('Timeout');
		});

		it('should cache successful results', async () => {
			await solver.solve({ url: 'https://example.com' });
			const cached = solver.getCached('example.com');
			expect(cached).not.toBeNull();
			expect(cached?.cookies[0].name).toBe('cf_clearance');
		});

		it('should NOT cache failed results', async () => {
			(solveChallenge as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: false,
				cookies: [],
				userAgent: '',
				solveTimeMs: 5000,
				challengeType: 'cloudflare',
				error: 'Timeout'
			} as SolveResult);
			await solver.solve({ url: 'https://example.com' });
			expect(solver.getCached('example.com')).toBeNull();
		});

		it('should update average solve time', async () => {
			await solver.solve({ url: 'https://example1.com' });
			expect(solver.getStats().avgSolveTimeMs).toBe(5000);

			(solveChallenge as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: true,
				cookies: [],
				userAgent: 'Test',
				solveTimeMs: 10000,
				challengeType: 'cloudflare'
			} as SolveResult);
			await solver.solve({ url: 'https://example2.com' });
			// Weighted avg: 5000 * 0.8 + 10000 * 0.2 = 6000
			expect(solver.getStats().avgSolveTimeMs).toBe(6000);
		});

		it('should not fall back to Playwright for challenge_required failures', async () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				fallbackToPlaywright: true
			});
			(solveChallenge as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: false,
				cookies: [],
				userAgent: '',
				solveTimeMs: 1000,
				challengeType: 'cloudflare',
				error: 'Challenge not bypassed for example.com'
			} as SolveResult);

			await solver.solve({ url: 'https://example.com' });

			// solveChallenge called once (primary only — no fallback for challenge failures)
			expect(solveChallenge).toHaveBeenCalledTimes(1);
		});
	});

	describe('test', () => {
		beforeEach(async () => {
			await startAndWaitReady(solver);
		});

		it('should delegate to testForChallenge', async () => {
			await solver.test('https://example.com');
			expect(testForChallenge).toHaveBeenCalledWith('https://example.com', { headless: true });
		});

		it('should pass headless config', async () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				headless: false
			});
			await solver.test('https://example.com');
			expect(testForChallenge).toHaveBeenCalledWith('https://example.com', { headless: false });
		});
	});

	describe('fetch', () => {
		beforeEach(async () => {
			await startAndWaitReady(solver);
			(browserFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: true,
				body: '<html></html>',
				url: 'https://example.com',
				status: 200,
				headers: { 'content-type': 'text/html' },
				cookies: [],
				userAgent: 'Test',
				timeMs: 1234
			});
		});

		it('should update stats on successful fetch', async () => {
			await solver.fetch({ url: 'https://example.com' });
			const stats = solver.getStats();
			expect(stats.fetchAttempts).toBe(1);
			expect(stats.fetchSuccessCount).toBe(1);
			expect(stats.fetchFailureCount).toBe(0);
			expect(stats.avgFetchTimeMs).toBeGreaterThan(0);
		});

		it('should update stats on failed fetch', async () => {
			(browserFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: false,
				body: '',
				url: 'https://example.com',
				status: 0,
				headers: {},
				cookies: [],
				userAgent: '',
				error: 'Failed',
				timeMs: 500
			});
			await solver.fetch({ url: 'https://example.com' });
			const stats = solver.getStats();
			expect(stats.fetchAttempts).toBe(1);
			expect(stats.fetchSuccessCount).toBe(0);
			expect(stats.fetchFailureCount).toBe(1);
			expect(stats.lastError).toBe('Failed');
		});

		it('should not fall back to Playwright when challenge_required', async () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				fallbackToPlaywright: true
			});
			(browserFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				success: false,
				body: '',
				url: 'https://example.com',
				status: 0,
				headers: {},
				cookies: [],
				userAgent: '',
				error: 'Challenge detected',
				timeMs: 500,
				failureKind: 'challenge_required'
			});

			await solver.fetch({ url: 'https://example.com' });

			// browserFetch called once — no Playwright fallback for challenge failures
			expect(browserFetch).toHaveBeenCalledTimes(1);
		});

		it('should fall back to Playwright on launch_failed', async () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				fallbackToPlaywright: true
			});
			(browserFetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					success: false,
					body: '',
					url: 'https://example.com',
					status: 0,
					headers: {},
					cookies: [],
					userAgent: '',
					error: 'Patchright not available',
					timeMs: 100,
					failureKind: 'launch_failed'
				})
				.mockResolvedValueOnce({
					success: true,
					body: '<html>ok</html>',
					url: 'https://example.com',
					status: 200,
					headers: {},
					cookies: [],
					userAgent: 'Test',
					timeMs: 500
				});

			const result = await solver.fetch({ url: 'https://example.com' });

			expect(browserFetch).toHaveBeenCalledTimes(2);
			expect(result.success).toBe(true);
			expect(result.attemptCount).toBe(2);
			expect(result.backend).toBe('playwright');
		});
	});

	describe('Cache management', () => {
		beforeEach(async () => {
			await startAndWaitReady(solver);
		});

		it('getCached should return null for non-existent domain', () => {
			expect(solver.getCached('nonexistent.com')).toBeNull();
		});

		it('getCached should return null for expired cache', async () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				cacheTtlSeconds: 0
			});
			await solver.solve({ url: 'https://example.com' });
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(solver.getCached('example.com')).toBeNull();
		});

		it('getCookiesForDomain should return cookies from cache', async () => {
			await solver.solve({ url: 'https://example.com' });
			const cookies = solver.getCookiesForDomain('example.com');
			expect(cookies?.[0].name).toBe('cf_clearance');
		});

		it('getUserAgentForDomain should return user agent from cache', async () => {
			await solver.solve({ url: 'https://example.com' });
			expect(solver.getUserAgentForDomain('example.com')).toBe('Mozilla/5.0 (Test)');
		});

		it('clearCacheForDomain should remove specific domain', async () => {
			await solver.solve({ url: 'https://example.com' });
			await solver.solve({ url: 'https://other.com' });
			solver.clearCacheForDomain('example.com');
			expect(solver.getCached('example.com')).toBeNull();
			expect(solver.getCached('other.com')).not.toBeNull();
		});

		it('clearCache should remove all entries', async () => {
			await solver.solve({ url: 'https://example.com' });
			await solver.solve({ url: 'https://other.com' });
			solver.clearCache();
			expect(solver.getCached('example.com')).toBeNull();
			expect(solver.getCached('other.com')).toBeNull();
		});
	});

	describe('getHealth', () => {
		it('should return available=false when disabled', () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				enabled: false
			});
			expect(solver.getHealth().available).toBe(false);
		});

		it('should return available=false when browser not available', () => {
			mockPatchrightManager.browserAvailable.mockReturnValue(false);
			expect(solver.getHealth().available).toBe(false);
		});

		it('should return available=true when enabled and browser available', async () => {
			await startAndWaitReady(solver);
			expect(solver.getHealth().available).toBe(true);
		});

		it('should return status=initializing when pending', () => {
			expect(solver.getHealth().status).toBe('initializing');
		});

		it('should return status=ready when ready', async () => {
			await startAndWaitReady(solver);
			expect(solver.getHealth().status).toBe('ready');
		});

		it('should return status=error on initialization failure', async () => {
			mockPatchrightManager.waitForAvailabilityCheck.mockRejectedValue(new Error('Failed'));
			solver.start();
			await waitForStatus(solver, 'error');
			expect(solver.getHealth().status).toBe('error');
		});

		it('should include stats in health', async () => {
			await startAndWaitReady(solver);
			await solver.solve({ url: 'https://example.com' });
			expect(solver.getHealth().stats.totalAttempts).toBe(1);
		});
	});

	describe('isAvailable', () => {
		it('should return false when disabled', () => {
			(captchaSolverSettingsService.getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
				...mockConfig,
				enabled: false
			});
			expect(solver.isAvailable()).toBe(false);
		});

		it('should return false when not ready', () => {
			expect(solver.isAvailable()).toBe(false);
		});

		it('should return false when browser not available', async () => {
			await startAndWaitReady(solver);
			mockPatchrightManager.browserAvailable.mockReturnValue(false);
			expect(solver.isAvailable()).toBe(false);
		});

		it('should return true when all conditions met', async () => {
			await startAndWaitReady(solver);
			expect(solver.isAvailable()).toBe(true);
		});
	});

	describe('resetStats', () => {
		it('should reset all statistics', async () => {
			await startAndWaitReady(solver);
			await solver.solve({ url: 'https://example.com' });
			solver.resetStats();
			const stats = solver.getStats();
			expect(stats.totalAttempts).toBe(0);
			expect(stats.successCount).toBe(0);
			expect(stats.avgSolveTimeMs).toBe(0);
			expect(stats.fetchAttempts).toBe(0);
		});

		it('should preserve cache size in stats after reset', async () => {
			await startAndWaitReady(solver);
			await solver.solve({ url: 'https://example.com' });
			solver.resetStats();
			expect(solver.getStats().cacheSize).toBe(1);
		});
	});

	describe('Singleton', () => {
		it('getCaptchaSolver should return same instance', () => {
			expect(getCaptchaSolver()).toBe(getCaptchaSolver());
		});
	});
});
