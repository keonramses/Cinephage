/**
 * Streaming Error Types
 *
 * Custom error classes for the streaming system with proper error categorization.
 */

import type { StreamingProviderId } from './provider';

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for categorizing streaming errors
 */
export const StreamErrorCode = {
	// Provider errors
	PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
	PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
	PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
	PROVIDER_INVALID_RESPONSE: 'PROVIDER_INVALID_RESPONSE',

	// Extraction errors
	EXTRACTION_FAILED: 'EXTRACTION_FAILED',
	NO_STREAMS_FOUND: 'NO_STREAMS_FOUND',
	ALL_PROVIDERS_FAILED: 'ALL_PROVIDERS_FAILED',

	// Validation errors
	STREAM_VALIDATION_FAILED: 'STREAM_VALIDATION_FAILED',
	PLAYLIST_INVALID: 'PLAYLIST_INVALID',
	PLAYLIST_PARSE_ERROR: 'PLAYLIST_PARSE_ERROR',
	SEGMENT_INACCESSIBLE: 'SEGMENT_INACCESSIBLE',
	STREAM_EXPIRED: 'STREAM_EXPIRED',

	// EncDec API errors
	ENCDEC_UNAVAILABLE: 'ENCDEC_UNAVAILABLE',
	ENCDEC_ENCRYPTION_FAILED: 'ENCDEC_ENCRYPTION_FAILED',
	ENCDEC_DECRYPTION_FAILED: 'ENCDEC_DECRYPTION_FAILED',

	// Content ID lookup errors
	CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
	CONTENT_ID_LOOKUP_FAILED: 'CONTENT_ID_LOOKUP_FAILED',

	// Proxy errors
	PROXY_FETCH_FAILED: 'PROXY_FETCH_FAILED',
	PROXY_SSRF_BLOCKED: 'PROXY_SSRF_BLOCKED',
	PROXY_REDIRECT_LOOP: 'PROXY_REDIRECT_LOOP',
	PROXY_SIZE_EXCEEDED: 'PROXY_SIZE_EXCEEDED',

	// Circuit breaker
	CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',

	// Generic
	UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type StreamErrorCode = (typeof StreamErrorCode)[keyof typeof StreamErrorCode];

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base error class for all streaming errors
 */
export class StreamError extends Error {
	/** Error code for categorization */
	readonly code: StreamErrorCode;

	/** Provider that caused the error (if applicable) */
	readonly provider?: StreamingProviderId;

	/** Whether this error is recoverable (can retry) */
	readonly recoverable: boolean;

	/** HTTP status code if relevant */
	readonly statusCode?: number;

	/** Additional context for debugging */
	readonly context?: Record<string, unknown>;

	/** Original error if this wraps another error */
	readonly cause?: Error;

	constructor(
		message: string,
		options: {
			code: StreamErrorCode;
			provider?: StreamingProviderId;
			recoverable?: boolean;
			statusCode?: number;
			context?: Record<string, unknown>;
			cause?: Error;
		}
	) {
		super(message);
		this.name = 'StreamError';
		this.code = options.code;
		this.provider = options.provider;
		this.recoverable = options.recoverable ?? false;
		this.statusCode = options.statusCode;
		this.context = options.context;
		this.cause = options.cause;

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, StreamError);
		}
	}

	/**
	 * Create a new error with additional context
	 */
	withContext(context: Record<string, unknown>): StreamError {
		return new StreamError(this.message, {
			code: this.code,
			provider: this.provider,
			recoverable: this.recoverable,
			statusCode: this.statusCode,
			context: { ...this.context, ...context },
			cause: this.cause
		});
	}

	/**
	 * Convert to plain object for logging/serialization
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			provider: this.provider,
			recoverable: this.recoverable,
			statusCode: this.statusCode,
			context: this.context,
			stack: this.stack
		};
	}
}

// ============================================================================
// Provider Errors
// ============================================================================

/**
 * Error when a provider is unavailable or not responding
 */
export class ProviderUnavailableError extends StreamError {
	constructor(
		provider: StreamingProviderId,
		message?: string,
		options?: { statusCode?: number; cause?: Error }
	) {
		super(message ?? `Provider ${provider} is unavailable`, {
			code: StreamErrorCode.PROVIDER_UNAVAILABLE,
			provider,
			recoverable: true, // Can try other providers
			statusCode: options?.statusCode,
			cause: options?.cause
		});
		this.name = 'ProviderUnavailableError';
	}
}

/**
 * Error when a provider times out
 */
export class ProviderTimeoutError extends StreamError {
	readonly timeoutMs: number;

	constructor(provider: StreamingProviderId, timeoutMs: number, cause?: Error) {
		super(`Provider ${provider} timed out after ${timeoutMs}ms`, {
			code: StreamErrorCode.PROVIDER_TIMEOUT,
			provider,
			recoverable: true,
			context: { timeoutMs },
			cause
		});
		this.name = 'ProviderTimeoutError';
		this.timeoutMs = timeoutMs;
	}
}

/**
 * Error when a provider rate limits us
 */
export class ProviderRateLimitedError extends StreamError {
	readonly retryAfter?: number;

	constructor(provider: StreamingProviderId, retryAfter?: number) {
		super(`Provider ${provider} rate limited${retryAfter ? `, retry after ${retryAfter}s` : ''}`, {
			code: StreamErrorCode.PROVIDER_RATE_LIMITED,
			provider,
			recoverable: true,
			statusCode: 429,
			context: { retryAfter }
		});
		this.name = 'ProviderRateLimitedError';
		this.retryAfter = retryAfter;
	}
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Error when stream validation fails
 */
export class StreamValidationError extends StreamError {
	constructor(
		message: string,
		options?: {
			provider?: StreamingProviderId;
			statusCode?: number;
			context?: Record<string, unknown>;
			cause?: Error;
		}
	) {
		super(message, {
			code: StreamErrorCode.STREAM_VALIDATION_FAILED,
			provider: options?.provider,
			recoverable: true, // Can try other streams
			statusCode: options?.statusCode,
			context: options?.context,
			cause: options?.cause
		});
		this.name = 'StreamValidationError';
	}
}

/**
 * Error when HLS playlist is invalid or cannot be parsed
 */
export class PlaylistParseError extends StreamError {
	constructor(message: string, options?: { url?: string; cause?: Error }) {
		super(message, {
			code: StreamErrorCode.PLAYLIST_PARSE_ERROR,
			recoverable: false,
			context: { url: options?.url },
			cause: options?.cause
		});
		this.name = 'PlaylistParseError';
	}
}

// ============================================================================
// EncDec API Errors
// ============================================================================

/**
 * Operation types for EncDec API
 */
export type EncDecOperation = 'encrypt' | 'decrypt' | 'parse' | 'token' | 'session' | 'search';

/**
 * Error from the EncDec API
 */
export class EncDecApiError extends StreamError {
	/** Which EncDec provider endpoint failed */
	readonly encDecProvider: string;

	/** What operation was being attempted */
	readonly operation: EncDecOperation;

	constructor(
		encDecProvider: string,
		operation: EncDecOperation,
		statusCode?: number,
		message?: string,
		cause?: Error
	) {
		super(message ?? `EncDec ${operation} failed for ${encDecProvider}`, {
			code:
				operation === 'encrypt'
					? StreamErrorCode.ENCDEC_ENCRYPTION_FAILED
					: StreamErrorCode.ENCDEC_DECRYPTION_FAILED,
			recoverable: true,
			statusCode,
			context: { encDecProvider, operation },
			cause
		});
		this.name = 'EncDecApiError';
		this.encDecProvider = encDecProvider;
		this.operation = operation;
	}
}

// ============================================================================
// Content ID Lookup Errors
// ============================================================================

/**
 * Error when content cannot be found for ID lookup
 */
export class ContentNotFoundError extends StreamError {
	readonly tmdbId: string;
	readonly mediaType: 'movie' | 'tv';

	constructor(tmdbId: string, mediaType: 'movie' | 'tv', provider?: StreamingProviderId) {
		super(`Content not found: ${mediaType} with TMDB ID ${tmdbId}`, {
			code: StreamErrorCode.CONTENT_NOT_FOUND,
			provider,
			recoverable: false,
			context: { tmdbId, mediaType }
		});
		this.name = 'ContentNotFoundError';
		this.tmdbId = tmdbId;
		this.mediaType = mediaType;
	}
}

/**
 * Error when content ID lookup fails
 */
export class ContentIdLookupError extends StreamError {
	constructor(
		provider: StreamingProviderId,
		message: string,
		options?: { cause?: Error; context?: Record<string, unknown> }
	) {
		super(message, {
			code: StreamErrorCode.CONTENT_ID_LOOKUP_FAILED,
			provider,
			recoverable: true,
			context: options?.context,
			cause: options?.cause
		});
		this.name = 'ContentIdLookupError';
	}
}

// ============================================================================
// Proxy Errors
// ============================================================================

/**
 * Error when proxy fetch fails
 */
export class ProxyError extends StreamError {
	readonly url: string;

	constructor(
		url: string,
		message: string,
		options?: {
			code?: StreamErrorCode;
			statusCode?: number;
			cause?: Error;
		}
	) {
		super(message, {
			code: options?.code ?? StreamErrorCode.PROXY_FETCH_FAILED,
			recoverable: options?.code !== StreamErrorCode.PROXY_SSRF_BLOCKED,
			statusCode: options?.statusCode,
			context: { url },
			cause: options?.cause
		});
		this.name = 'ProxyError';
		this.url = url;
	}

	/**
	 * Create SSRF blocked error
	 */
	static ssrfBlocked(url: string, reason: string): ProxyError {
		return new ProxyError(url, `SSRF blocked: ${reason}`, {
			code: StreamErrorCode.PROXY_SSRF_BLOCKED
		});
	}

	/**
	 * Create redirect loop error
	 */
	static redirectLoop(url: string): ProxyError {
		return new ProxyError(url, 'Redirect loop detected', {
			code: StreamErrorCode.PROXY_REDIRECT_LOOP
		});
	}

	/**
	 * Create size exceeded error
	 */
	static sizeExceeded(url: string, size: number, maxSize: number): ProxyError {
		return new ProxyError(url, `Response size ${size} exceeds limit ${maxSize}`, {
			code: StreamErrorCode.PROXY_SIZE_EXCEEDED
		});
	}
}

// ============================================================================
// Circuit Breaker Error
// ============================================================================

/**
 * Error when circuit breaker is open
 */
export class CircuitBreakerOpenError extends StreamError {
	readonly resetAt?: Date;

	constructor(provider: StreamingProviderId, resetAt?: number) {
		super(`Circuit breaker open for provider ${provider}`, {
			code: StreamErrorCode.CIRCUIT_BREAKER_OPEN,
			provider,
			recoverable: true,
			context: { resetAt }
		});
		this.name = 'CircuitBreakerOpenError';
		this.resetAt = resetAt ? new Date(resetAt) : undefined;
	}
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if an error is a StreamError
 */
export function isStreamError(error: unknown): error is StreamError {
	return error instanceof StreamError;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
	if (isStreamError(error)) {
		return error.recoverable;
	}
	return false;
}

/**
 * Wrap any error as a StreamError
 */
export function wrapError(error: unknown, context?: Record<string, unknown>): StreamError {
	if (isStreamError(error)) {
		return context ? error.withContext(context) : error;
	}

	const message = error instanceof Error ? error.message : String(error);
	const cause = error instanceof Error ? error : undefined;

	return new StreamError(message, {
		code: StreamErrorCode.UNKNOWN_ERROR,
		recoverable: false,
		context,
		cause
	});
}
