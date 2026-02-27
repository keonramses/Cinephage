import type { RequestEvent } from '@sveltejs/kit';

interface RateLimitEntry {
	count: number;
	resetTime: number;
}

// In-memory store for rate limiting
// In production with multiple instances, use Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
	windowMs: number; // Time window in milliseconds
	maxRequests: number; // Max requests per window
}

// Default rate limits
const DEFAULT_API_LIMIT: RateLimitConfig = {
	windowMs: 15 * 60 * 1000, // 15 minutes
	maxRequests: 100
};

const AUTH_LIMIT: RateLimitConfig = {
	windowMs: 15 * 60 * 1000, // 15 minutes
	maxRequests: 5
};

const STREAMING_LIMIT: RateLimitConfig = {
	windowMs: 60 * 1000, // 1 minute
	maxRequests: 30
};

/**
 * Get rate limit key from request
 * Uses IP address + user agent hash for identification
 */
function getRateLimitKey(event: RequestEvent, prefix: string): string {
	const forwardedFor = event.request.headers.get('x-forwarded-for');
	const ip = forwardedFor?.split(',')[0]?.trim() || event.getClientAddress();
	const userAgent = event.request.headers.get('user-agent') || 'unknown';

	// Simple hash of IP + user agent prefix
	const hash = `${prefix}:${ip}:${userAgent.slice(0, 50)}`;
	return hash;
}

/**
 * Check if request is within rate limit
 * Returns true if allowed, false if rate limited
 */
function isWithinLimit(key: string, config: RateLimitConfig): boolean {
	const now = Date.now();
	const entry = rateLimitStore.get(key);

	if (!entry || now > entry.resetTime) {
		// First request or window expired - create new entry
		rateLimitStore.set(key, {
			count: 1,
			resetTime: now + config.windowMs
		});
		return true;
	}

	if (entry.count >= config.maxRequests) {
		return false;
	}

	entry.count++;
	return true;
}

/**
 * Get remaining requests and reset time for headers
 */
function getRateLimitInfo(
	key: string,
	config: RateLimitConfig
): { remaining: number; resetTime: number } {
	const entry = rateLimitStore.get(key);

	if (!entry) {
		return { remaining: config.maxRequests - 1, resetTime: Date.now() + config.windowMs };
	}

	return {
		remaining: Math.max(0, config.maxRequests - entry.count),
		resetTime: entry.resetTime
	};
}

/**
 * Check rate limit for API requests
 * Returns null if allowed, or a Response if rate limited
 */
export function checkApiRateLimit(event: RequestEvent): Response | null {
	const pathname = event.url.pathname;

	// Determine rate limit config based on route
	let config: RateLimitConfig;
	let keyPrefix: string;

	// Auth endpoints get stricter limits
	if (pathname.startsWith('/api/auth/')) {
		config = AUTH_LIMIT;
		keyPrefix = 'auth';
	}
	// Streaming endpoints get different limits
	else if (pathname.startsWith('/api/streaming/') || pathname.startsWith('/api/livetv/stream/')) {
		config = STREAMING_LIMIT;
		keyPrefix = 'stream';
	}
	// Standard API endpoints
	else {
		config = DEFAULT_API_LIMIT;
		keyPrefix = 'api';
	}

	const key = getRateLimitKey(event, keyPrefix);

	if (!isWithinLimit(key, config)) {
		const info = getRateLimitInfo(key, config);

		return new Response(
			JSON.stringify({
				success: false,
				error: 'Rate limit exceeded. Please try again later.',
				code: 'RATE_LIMITED'
			}),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'X-RateLimit-Limit': String(config.maxRequests),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': String(Math.ceil(info.resetTime / 1000)),
					'Retry-After': String(Math.ceil((info.resetTime - Date.now()) / 1000))
				}
			}
		);
	}

	// Add rate limit headers to successful requests
	const info = getRateLimitInfo(key, config);
	return null;
}

/**
 * Middleware to apply rate limiting to API routes
 * Usage in hooks or individual routes
 */
export function applyRateLimitHeaders(event: RequestEvent, response: Response): Response {
	const pathname = event.url.pathname;

	// Skip rate limit headers for non-API routes
	if (!pathname.startsWith('/api/')) {
		return response;
	}

	// Determine rate limit config
	let config: RateLimitConfig;
	let keyPrefix: string;

	if (pathname.startsWith('/api/auth/')) {
		config = AUTH_LIMIT;
		keyPrefix = 'auth';
	} else if (pathname.startsWith('/api/streaming/') || pathname.startsWith('/api/livetv/stream/')) {
		config = STREAMING_LIMIT;
		keyPrefix = 'stream';
	} else {
		config = DEFAULT_API_LIMIT;
		keyPrefix = 'api';
	}

	const key = getRateLimitKey(event, keyPrefix);
	const info = getRateLimitInfo(key, config);

	// Clone response and add headers
	const newResponse = new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});

	newResponse.headers.set('X-RateLimit-Limit', String(config.maxRequests));
	newResponse.headers.set('X-RateLimit-Remaining', String(info.remaining));
	newResponse.headers.set('X-RateLimit-Reset', String(Math.ceil(info.resetTime / 1000)));

	return newResponse;
}

/**
 * Cleanup old rate limit entries periodically
 */
export function cleanupRateLimits(): void {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore.entries()) {
		if (now > entry.resetTime) {
			rateLimitStore.delete(key);
		}
	}
}

// Run cleanup every 10 minutes
setInterval(cleanupRateLimits, 10 * 60 * 1000);
