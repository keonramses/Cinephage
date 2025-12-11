/**
 * Streaming Errors
 *
 * Re-exports error classes from the types module.
 * Import from here for cleaner imports in error handling code.
 */

export {
	// Error codes
	StreamErrorCode,
	type StreamErrorCode as StreamErrorCodeType,

	// Base error
	StreamError,

	// Provider errors
	ProviderUnavailableError,
	ProviderTimeoutError,
	ProviderRateLimitedError,

	// Validation errors
	StreamValidationError,
	PlaylistParseError,

	// EncDec API errors
	EncDecApiError,
	type EncDecOperation,

	// Content ID lookup errors
	ContentNotFoundError,
	ContentIdLookupError,

	// Proxy errors
	ProxyError,

	// Circuit breaker
	CircuitBreakerOpenError,

	// Utilities
	isStreamError,
	isRecoverableError,
	wrapError
} from '../types/error';
