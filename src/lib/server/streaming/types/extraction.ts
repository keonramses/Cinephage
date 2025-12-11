/**
 * Extraction Types
 *
 * Type definitions for stream extraction options and results.
 */

import type { StreamSource, StreamValidation, ValidatedStreamSource } from './stream';
import type { SearchParams, StreamingProviderId } from './provider';

// ============================================================================
// Extraction Options
// ============================================================================

/**
 * Options for the orchestrator's extractStreams function
 */
export interface ExtractOptions extends SearchParams {
	/** Specific provider to use (skip fallback) */
	provider?: StreamingProviderId;

	/** Whether to use parallel extraction (default: true when multiple providers available) */
	parallel?: boolean;

	/** Whether to validate streams before returning (default: false) */
	validateStream?: boolean;

	/** Skip providers with open circuit breakers (default: true) */
	respectCircuitBreaker?: boolean;

	/** Maximum number of providers to try (default: all enabled) */
	maxProviders?: number;
}

// ============================================================================
// Extraction Results
// ============================================================================

/**
 * Result from stream extraction
 */
export interface ExtractionResult {
	/** Whether extraction was successful */
	success: boolean;

	/** Extracted stream sources */
	sources: StreamSource[];

	/** Error message if failed */
	error?: string;

	/** Provider that produced this result */
	provider?: string;

	/** Total duration of extraction in milliseconds */
	durationMs?: number;

	/** Number of providers tried */
	providersAttempted?: number;
}

/**
 * Extended extraction result with validation info
 */
export interface ValidatedExtractionResult extends ExtractionResult {
	/** Validated stream sources */
	sources: ValidatedStreamSource[];

	/** Whether validation was performed */
	validated: boolean;

	/** When validation was performed */
	validatedAt?: Date;

	/** How long validation took in ms */
	validationDurationMs?: number;
}

// ============================================================================
// Extractor Options (Legacy compatibility)
// ============================================================================

/**
 * Legacy extractor options interface
 * @deprecated Use ExtractOptions instead
 */
export interface ExtractorOptions {
	/** TMDB ID (required) */
	tmdbId: string;

	/** Media type */
	type: 'movie' | 'tv';

	/** Season number for TV shows */
	season?: number;

	/** Episode number for TV shows */
	episode?: number;

	/** IMDB ID (optional, some providers use it) */
	imdbId?: string;

	/** Content title (optional, some providers use it) */
	title?: string;

	/** Release year (optional) */
	year?: number;
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/**
 * Circuit breaker state for a provider
 */
export interface CircuitBreakerState {
	/** Number of consecutive failures */
	failures: number;

	/** Whether the circuit is currently open (blocking requests) */
	isOpen: boolean;

	/** Timestamp when the circuit will reset */
	resetAt?: number;
}

/**
 * Extended circuit breaker state with half-open support
 */
export interface ExtendedCircuitState extends CircuitBreakerState {
	/** Whether the circuit is in half-open state (allowing test requests) */
	isHalfOpen?: boolean;

	/** Timestamp when circuit entered half-open state */
	halfOpenAt?: number;

	/** Failure timestamps for sliding window */
	failureTimestamps?: number[];
}

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
	/** Number of failures before circuit opens (default: 3) */
	failureThreshold: number;

	/** Sliding window duration in ms (default: 60000) */
	windowMs: number;

	/** Time before circuit enters half-open state in ms (default: 30000) */
	halfOpenAfterMs: number;

	/** Time before circuit fully resets in ms (default: 60000) */
	resetAfterMs: number;

	/** In half-open, allow 1/N requests through (default: 5) */
	testRequestRatio: number;
}

// ============================================================================
// Health Types
// ============================================================================

/**
 * Health metrics for a provider
 */
export interface ProviderHealth {
	/** Provider identifier */
	providerId: StreamingProviderId;

	/** Number of successful extractions */
	successCount: number;

	/** Number of failed extractions */
	failureCount: number;

	/** Success rate (0-100) */
	successRate: number;

	/** Average latency in milliseconds */
	avgLatency: number;

	/** Latency samples for rolling average */
	latencySamples: number[];

	/** Timestamp of last successful extraction */
	lastSuccess?: number;

	/** Timestamp of last failed extraction */
	lastFailure?: number;
}

/**
 * Result of a health check
 */
export interface HealthCheckResult {
	/** Provider identifier */
	providerId: StreamingProviderId;

	/** Whether the provider is healthy */
	healthy: boolean;

	/** Response time in milliseconds */
	responseTime: number;

	/** Last successful check time */
	lastSuccess?: Date;

	/** Last failure time */
	lastFailure?: Date;

	/** Error message if unhealthy */
	error?: string;

	/** Stream validation result if performed */
	streamValidation?: StreamValidation;
}

// ============================================================================
// Provider Status Types
// ============================================================================

/**
 * Provider status for monitoring
 */
export interface ProviderStatus {
	/** Provider identifier */
	id: StreamingProviderId;

	/** Provider display name */
	name: string;

	/** Whether the provider is enabled */
	enabled: boolean;

	/** Circuit breaker state */
	circuitBreaker: {
		isOpen: boolean;
		isHalfOpen: boolean;
		failures: number;
		resetAt?: number;
	};

	/** Health metrics */
	health: ProviderHealth;

	/** Overall health score (0-100) */
	score: number;
}
