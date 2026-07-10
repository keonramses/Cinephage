/**
 * Captcha Solver Service
 *
 * Manages browser-based session acquisition using Patchright (primary) or
 * Playwright (fallback for launch/availability failures only).
 *
 * Fallback policy:
 * - challenge_required: never fall back — Playwright won't resolve a CF challenge either
 * - launch_failed / unavailable / navigation_failed: retry once with Playwright
 */

import type { Cookie } from 'playwright-core';
import { createChildLogger } from '$lib/logging';
import type { BackgroundService } from '$lib/server/services/background-service';
import { captchaSolverSettingsService } from './CaptchaSolverSettings';
import type {
	BrowserBackend,
	BrowserFetchRequest,
	BrowserFetchResult,
	CachedSolveResult,
	ChallengeType,
	SolveRequest,
	SolveResult,
	SolverHealth,
	SolverStats
} from './types';
import { browserFetch, solveChallenge, testForChallenge } from './browser/PatchrightSolver';
import { BaseBrowserManager } from './browser/BaseBrowserManager';
import { getPatchrightManager, shutdownPatchrightManager } from './browser/PatchrightManager';
import { getPlaywrightManager, shutdownPlaywrightManager } from './browser/PlaywrightManager';

const logger = createChildLogger({ logDomain: 'indexers' as const });

function getManagerForBackend(backend: BrowserBackend): BaseBrowserManager {
	return backend === 'patchright' ? getPatchrightManager() : getPlaywrightManager();
}

export class CaptchaSolver implements BackgroundService {
	readonly name = 'CaptchaSolver';
	private _status: 'pending' | 'starting' | 'ready' | 'error' = 'pending';
	private _error: string | undefined;

	private cache = new Map<string, CachedSolveResult>();
	private stats: SolverStats = {
		totalAttempts: 0,
		successCount: 0,
		failureCount: 0,
		cacheHits: 0,
		avgSolveTimeMs: 0,
		cacheSize: 0,
		fetchAttempts: 0,
		fetchSuccessCount: 0,
		fetchFailureCount: 0,
		avgFetchTimeMs: 0
	};

	private pendingSolves = new Map<string, Promise<SolveResult>>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	get status() {
		return this._status;
	}

	start(): void {
		if (this._status === 'ready' || this._status === 'starting') return;
		this._status = 'starting';
		setImmediate(() => { this.initialize(); });
	}

	private async initialize(): Promise<void> {
		try {
			logger.info('[CaptchaSolver] Initializing');

			const patchrightManager = getPatchrightManager();
			await patchrightManager.waitForAvailabilityCheck();

			const config = captchaSolverSettingsService.getConfig();
			if (config.fallbackToPlaywright) {
				const playwrightManager = getPlaywrightManager();
				await playwrightManager.waitForAvailabilityCheck();
			}

			this.startCacheCleanup();
			this._status = 'ready';
			logger.info(
				{ browserAvailable: patchrightManager.browserAvailable() },
				'[CaptchaSolver] Ready'
			);
		} catch (error) {
			this._error = error instanceof Error ? error.message : String(error);
			this._status = 'error';
			logger.error({ err: error }, '[CaptchaSolver] Initialization failed');
		}
	}

	async stop(): Promise<void> {
		logger.info('[CaptchaSolver] Stopping');
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.cache.clear();
		await Promise.all([shutdownPatchrightManager(), shutdownPlaywrightManager()]);
		this._status = 'pending';
		logger.info('[CaptchaSolver] Stopped');
	}

	async solve(request: SolveRequest): Promise<SolveResult> {
		const config = captchaSolverSettingsService.getConfig();

		if (!config.enabled) {
			return {
				success: false, cookies: [], userAgent: '', solveTimeMs: 0,
				challengeType: 'unknown', error: 'Captcha solver is disabled'
			};
		}

		const domain = new URL(request.url).hostname;
		const cached = this.getCached(domain);
		if (cached) {
			this.stats.cacheHits++;
			logger.debug({ domain }, '[CaptchaSolver] Cache hit');
			return {
				success: true, cookies: cached.cookies, userAgent: cached.userAgent,
				solveTimeMs: 0, challengeType: 'unknown'
			};
		}

		const pending = this.pendingSolves.get(domain);
		if (pending) {
			logger.debug({ domain }, '[CaptchaSolver] Waiting for pending solve');
			return pending;
		}

		this.stats.totalAttempts++;
		const solvePromise = this.doSolve(request, config);
		this.pendingSolves.set(domain, solvePromise);

		try {
			const result = await solvePromise;
			if (result.success) {
				this.stats.successCount++;
				this.setCached(domain, {
					domain,
					cookies: result.cookies,
					userAgent: result.userAgent,
					createdAt: new Date(),
					expiresAt: new Date(Date.now() + config.cacheTtlSeconds * 1000),
					backend: config.browserBackend
				});
			} else {
				this.stats.failureCount++;
				this.stats.lastError = result.error;
			}
			this.updateAvgSolveTime(result.solveTimeMs);
			this.stats.lastSolveAt = new Date();
			return result;
		} finally {
			this.pendingSolves.delete(domain);
		}
	}

	private async doSolve(
		request: SolveRequest,
		config: ReturnType<typeof captchaSolverSettingsService.getConfig>
	): Promise<SolveResult> {
		const primary = getManagerForBackend(config.browserBackend);
		const result = await solveChallenge(request, config, primary);
		if (result.success) return result;

		// Never fall back on a detected challenge — Playwright won't solve it either.
		// Also require PlaywrightManager to actually be available on this host.
		// "Target returned N" means the site itself rejected the request; retrying
		// with a different browser binary won't help.
		const canFallback =
			config.browserBackend === 'patchright' &&
			config.fallbackToPlaywright &&
			getPlaywrightManager().browserAvailable() &&
			result.error !== undefined &&
			!result.error.includes('Challenge not bypassed') &&
			!result.error.startsWith('Target returned');

		if (!canFallback) return result;

		logger.info(
			{ domain: new URL(request.url).hostname, primaryError: result.error },
			'[CaptchaSolver] Falling back to Playwright for solve'
		);
		return solveChallenge(request, config, getPlaywrightManager());
	}

	async test(
		url: string
	): Promise<{ hasChallenge: boolean; type: ChallengeType; confidence: number }> {
		const config = captchaSolverSettingsService.getConfig();
		return testForChallenge(url, { headless: config.headless });
	}

	async fetch(request: BrowserFetchRequest): Promise<BrowserFetchResult> {
		const config = captchaSolverSettingsService.getConfig();

		if (!config.enabled) {
			return {
				success: false, body: '', url: request.url, status: 0,
				headers: {}, cookies: [], userAgent: '',
				error: 'Captcha solver is disabled', timeMs: 0
			};
		}

		if (!this.isAvailable()) {
			return {
				success: false, body: '', url: request.url, status: 0,
				headers: {}, cookies: [], userAgent: '',
				error: 'Browser not available', timeMs: 0, failureKind: 'unavailable'
			};
		}

		const fetchStart = Date.now();
		this.stats.fetchAttempts++;

		const result = await this.doFetch(request, config);

		if (result.success) {
			this.stats.fetchSuccessCount++;
		} else {
			this.stats.fetchFailureCount++;
			this.stats.lastError = result.error;
		}

		this.updateAvgFetchTime(Math.max(Date.now() - fetchStart, result.timeMs, 1));
		this.stats.lastFetchAt = new Date();
		return result;
	}

	private async doFetch(
		request: BrowserFetchRequest,
		config: ReturnType<typeof captchaSolverSettingsService.getConfig>
	): Promise<BrowserFetchResult> {
		const primary = getManagerForBackend(config.browserBackend);
		const first = await browserFetch(request, config, primary);

		if (first.success) return { ...first, backend: config.browserBackend, attemptCount: 1 };

		// Only fall back for infrastructure failures, not challenge failures,
		// and only when the Playwright backend is actually available on this host.
		const canFallback =
			config.browserBackend === 'patchright' &&
			config.fallbackToPlaywright &&
			getPlaywrightManager().browserAvailable() &&
			first.failureKind !== 'challenge_required' &&
			first.failureKind !== 'target_rejected';

		if (!canFallback) return { ...first, backend: config.browserBackend, attemptCount: 1 };

		logger.info(
			{
				url: request.url,
				failureKind: first.failureKind,
				primaryError: first.error
			},
			'[CaptchaSolver] Falling back to Playwright for fetch'
		);

		const second = await browserFetch(request, config, getPlaywrightManager());
		return { ...second, backend: 'playwright', attemptCount: 2 };
	}

	getCached(domain: string): CachedSolveResult | null {
		const cached = this.cache.get(domain);
		if (!cached) return null;
		if (new Date() > cached.expiresAt) {
			this.cache.delete(domain);
			return null;
		}
		return cached;
	}

	getCookiesForDomain(domain: string): Cookie[] | null {
		return this.getCached(domain)?.cookies ?? null;
	}

	getUserAgentForDomain(domain: string): string | null {
		return this.getCached(domain)?.userAgent ?? null;
	}

	private setCached(domain: string, result: CachedSolveResult): void {
		this.cache.set(domain, result);
		this.stats.cacheSize = this.cache.size;
	}

	clearCacheForDomain(domain: string): void {
		this.cache.delete(domain);
		this.stats.cacheSize = this.cache.size;
	}

	clearCache(): void {
		this.cache.clear();
		this.stats.cacheSize = 0;
	}

	private startCacheCleanup(): void {
		this.cleanupInterval = setInterval(() => { this.cleanupExpiredCache(); }, 5 * 60 * 1000);
	}

	private cleanupExpiredCache(): void {
		const now = new Date();
		let removed = 0;
		for (const [domain, cached] of this.cache) {
			if (now > cached.expiresAt) { this.cache.delete(domain); removed++; }
		}
		if (removed > 0) {
			this.stats.cacheSize = this.cache.size;
			logger.debug({ removed }, '[CaptchaSolver] Cleaned up expired cache');
		}
	}

	private updateAvgSolveTime(newTime: number): void {
		const total = this.stats.successCount + this.stats.failureCount;
		this.stats.avgSolveTimeMs = total === 1
			? newTime
			: Math.round(this.stats.avgSolveTimeMs * 0.8 + newTime * 0.2);
	}

	private updateAvgFetchTime(newTime: number): void {
		const total = this.stats.fetchSuccessCount + this.stats.fetchFailureCount;
		this.stats.avgFetchTimeMs = total === 1
			? newTime
			: Math.round(this.stats.avgFetchTimeMs * 0.8 + newTime * 0.2);
	}

	getHealth(): SolverHealth {
		const config = captchaSolverSettingsService.getConfig();
		const manager = getManagerForBackend(config.browserBackend);

		let status: SolverHealth['status'];
		if (this._status === 'pending' || this._status === 'starting') {
			status = 'initializing';
		} else if (this._status === 'ready') {
			status = this.pendingSolves.size > 0 ? 'busy' : 'ready';
		} else if (this._status === 'error') {
			status = 'error';
		} else {
			status = 'disabled';
		}

		return {
			available: config.enabled && manager.browserAvailable(),
			status,
			browserAvailable: manager.browserAvailable(),
			error: this._error ?? manager.getAvailabilityError(),
			stats: { ...this.stats }
		};
	}

	getStats(): SolverStats {
		return { ...this.stats };
	}

	isAvailable(): boolean {
		const config = captchaSolverSettingsService.getConfig();
		return (
			config.enabled &&
			this._status === 'ready' &&
			getManagerForBackend(config.browserBackend).browserAvailable()
		);
	}

	resetStats(): void {
		this.stats = {
			totalAttempts: 0, successCount: 0, failureCount: 0, cacheHits: 0,
			avgSolveTimeMs: 0, cacheSize: this.cache.size,
			fetchAttempts: 0, fetchSuccessCount: 0, fetchFailureCount: 0, avgFetchTimeMs: 0
		};
	}
}

let captchaSolverInstance: CaptchaSolver | null = null;

export function getCaptchaSolver(): CaptchaSolver {
	if (!captchaSolverInstance) captchaSolverInstance = new CaptchaSolver();
	return captchaSolverInstance;
}
