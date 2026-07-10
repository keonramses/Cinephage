/**
 * Captcha Solver Types
 */

import type { Cookie } from 'playwright-core';

export type ChallengeType =
	| 'cloudflare'
	| 'cloudflare_turnstile'
	| 'cloudflare_managed'
	| 'ddos_guard'
	| 'unknown';

export type BrowserBackend = 'patchright' | 'playwright';

export type BrowserFailureKind =
	| 'unavailable'
	| 'launch_failed'
	| 'navigation_failed'
	| 'challenge_required'
	| 'target_rejected'
	| 'unknown';

export interface ChallengeDetectionResult {
	detected: boolean;
	type: ChallengeType;
	confidence: number;
}

export interface SolveResult {
	success: boolean;
	cookies: Cookie[];
	userAgent: string;
	solveTimeMs: number;
	challengeType: ChallengeType;
	error?: string;
	response?: {
		url: string;
		status: number;
	};
}

export interface CachedSolveResult {
	domain: string;
	cookies: Cookie[];
	userAgent: string;
	createdAt: Date;
	expiresAt: Date;
	backend: BrowserBackend;
}

export interface CaptchaSolverConfig {
	enabled: boolean;
	timeoutSeconds: number;
	cacheTtlSeconds: number;
	headless: boolean;
	browserBackend: BrowserBackend;
	fallbackToPlaywright: boolean;
	proxy?: ProxyConfig;
}

export interface ProxyConfig {
	url: string;
	username?: string;
	password?: string;
}

export const DEFAULT_CONFIG: CaptchaSolverConfig = {
	enabled: true,
	timeoutSeconds: 60,
	cacheTtlSeconds: 3600,
	headless: true,
	browserBackend: 'patchright',
	fallbackToPlaywright: false
};

export interface SolveRequest {
	url: string;
	timeout?: number;
	cookies?: Cookie[];
	proxy?: ProxyConfig;
}

export interface BrowserFetchRequest {
	url: string;
	method?: 'GET' | 'POST';
	body?: string;
	contentType?: string;
	timeout?: number;
	proxy?: ProxyConfig;
	/** Pre-populate the browser session with these cookies before navigating. */
	cookies?: Cookie[];
	/** User-agent to set on the browser context (reserved for future use). */
	userAgent?: string;
}

export interface BrowserFetchResult {
	success: boolean;
	body: string;
	url: string;
	status: number;
	headers?: Record<string, string | undefined>;
	cookies?: Cookie[];
	userAgent?: string;
	error?: string;
	timeMs: number;
	failureKind?: BrowserFailureKind;
	backend?: BrowserBackend;
	attemptCount?: number;
}

export interface SolverStats {
	totalAttempts: number;
	successCount: number;
	failureCount: number;
	cacheHits: number;
	avgSolveTimeMs: number;
	cacheSize: number;
	fetchAttempts: number;
	fetchSuccessCount: number;
	fetchFailureCount: number;
	avgFetchTimeMs: number;
	lastSolveAt?: Date;
	lastFetchAt?: Date;
	lastError?: string;
}

export interface SolverHealth {
	available: boolean;
	status: 'ready' | 'busy' | 'disabled' | 'error' | 'initializing';
	browserAvailable: boolean;
	error?: string;
	stats: SolverStats;
}
