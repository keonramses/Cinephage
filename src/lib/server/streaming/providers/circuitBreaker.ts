/**
 * Enhanced Circuit Breaker
 *
 * Implements a circuit breaker pattern with:
 * - Sliding window failure tracking
 * - Per-provider configuration
 * - Half-open state for test requests
 * - Graceful degradation
 */

import { logger } from '$lib/logging';
import type { StreamingProviderId, CircuitBreakerConfig, ExtendedCircuitState } from '../types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 3,
	windowMs: 60000, // 1 minute sliding window
	halfOpenAfterMs: 30000, // 30 seconds until half-open
	resetAfterMs: 60000, // 60 seconds until full reset
	testRequestRatio: 5 // In half-open, allow 1/5 requests
};

// ============================================================================
// Circuit Breaker Class
// ============================================================================

/**
 * Enhanced circuit breaker with sliding window failure tracking
 */
export class CircuitBreaker {
	private state: ExtendedCircuitState;
	private config: CircuitBreakerConfig;
	private providerId: StreamingProviderId;
	private resetTimer: NodeJS.Timeout | null = null;
	private testRequestCounter = 0;

	constructor(providerId: StreamingProviderId, config?: Partial<CircuitBreakerConfig>) {
		this.providerId = providerId;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.state = {
			failures: 0,
			isOpen: false,
			failureTimestamps: []
		};
	}

	// --------------------------------------------------------------------------
	// Public API
	// --------------------------------------------------------------------------

	/**
	 * Check if a request should be allowed through
	 */
	shouldAllow(): boolean {
		this.cleanupOldFailures();

		// If circuit is closed, allow all requests
		if (!this.state.isOpen) {
			return true;
		}

		const now = Date.now();

		// Check if we should transition to half-open
		if (!this.state.isHalfOpen && this.state.resetAt) {
			const halfOpenTime = this.state.resetAt - (this.config.resetAfterMs - this.config.halfOpenAfterMs);
			if (now >= halfOpenTime) {
				this.transitionToHalfOpen();
				return true; // Allow the test request
			}
		}

		// Check if circuit should fully reset
		if (this.state.resetAt && now >= this.state.resetAt) {
			this.reset();
			return true;
		}

		// In half-open state, allow some requests through
		if (this.state.isHalfOpen) {
			this.testRequestCounter++;
			if (this.testRequestCounter % this.config.testRequestRatio === 0) {
				logger.debug('Circuit breaker half-open: allowing test request', {
					provider: this.providerId,
					counter: this.testRequestCounter,
					...streamLog
				});
				return true;
			}
		}

		// Circuit is open, block request
		return false;
	}

	/**
	 * Record a successful operation
	 */
	recordSuccess(durationMs?: number): void {
		const wasHalfOpen = this.state.isHalfOpen;
		this.reset();

		if (wasHalfOpen) {
			logger.info('Circuit breaker closed after successful test request', {
				provider: this.providerId,
				durationMs,
				...streamLog
			});
		}
	}

	/**
	 * Record a failed operation
	 */
	recordFailure(durationMs?: number): void {
		const now = Date.now();

		// If in half-open state and failure, reopen circuit
		if (this.state.isHalfOpen) {
			this.openCircuit(now);
			logger.warn('Circuit breaker reopened after half-open failure', {
				provider: this.providerId,
				durationMs,
				...streamLog
			});
			return;
		}

		// Add failure timestamp for sliding window
		this.state.failureTimestamps = this.state.failureTimestamps ?? [];
		this.state.failureTimestamps.push(now);

		// Clean up old failures
		this.cleanupOldFailures();

		// Count failures in current window
		const failuresInWindow = this.state.failureTimestamps.length;
		this.state.failures = failuresInWindow;

		// Check if we should open the circuit
		if (failuresInWindow >= this.config.failureThreshold) {
			this.openCircuit(now);
			logger.warn('Circuit breaker opened', {
				provider: this.providerId,
				failures: failuresInWindow,
				windowMs: this.config.windowMs,
				halfOpenMs: this.config.halfOpenAfterMs,
				resetMs: this.config.resetAfterMs,
				durationMs,
				...streamLog
			});
		} else {
			logger.debug('Failure recorded', {
				provider: this.providerId,
				failuresInWindow,
				threshold: this.config.failureThreshold,
				durationMs,
				...streamLog
			});
		}
	}

	/**
	 * Force the circuit open
	 */
	forceOpen(): void {
		this.openCircuit(Date.now());
		logger.info('Circuit breaker force opened', {
			provider: this.providerId,
			...streamLog
		});
	}

	/**
	 * Force the circuit closed
	 */
	forceClose(): void {
		this.reset();
		logger.info('Circuit breaker force closed', {
			provider: this.providerId,
			...streamLog
		});
	}

	/**
	 * Get the current state
	 */
	getState(): ExtendedCircuitState {
		this.cleanupOldFailures();
		return { ...this.state };
	}

	/**
	 * Check if the circuit is open
	 */
	isOpen(): boolean {
		return !this.shouldAllow();
	}

	/**
	 * Check if the circuit is in half-open state
	 */
	isHalfOpen(): boolean {
		return this.state.isHalfOpen ?? false;
	}

	/**
	 * Get the provider ID
	 */
	getProviderId(): StreamingProviderId {
		return this.providerId;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
			this.resetTimer = null;
		}
	}

	// --------------------------------------------------------------------------
	// Private Methods
	// --------------------------------------------------------------------------

	private openCircuit(now: number): void {
		this.state.isOpen = true;
		this.state.isHalfOpen = false;
		this.state.resetAt = now + this.config.resetAfterMs;
		this.testRequestCounter = 0;

		// Schedule reset
		this.scheduleReset();
	}

	private transitionToHalfOpen(): void {
		this.state.isHalfOpen = true;
		this.state.halfOpenAt = Date.now();
		this.testRequestCounter = 0;

		logger.debug('Circuit breaker entering half-open state', {
			provider: this.providerId,
			...streamLog
		});
	}

	private reset(): void {
		this.state = {
			failures: 0,
			isOpen: false,
			failureTimestamps: []
		};
		this.testRequestCounter = 0;

		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
			this.resetTimer = null;
		}
	}

	private scheduleReset(): void {
		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
		}

		this.resetTimer = setTimeout(() => {
			this.reset();
			logger.debug('Circuit breaker automatically reset', {
				provider: this.providerId,
				...streamLog
			});
		}, this.config.resetAfterMs);
	}

	private cleanupOldFailures(): void {
		if (!this.state.failureTimestamps) return;

		const cutoff = Date.now() - this.config.windowMs;
		this.state.failureTimestamps = this.state.failureTimestamps.filter((ts) => ts > cutoff);
		this.state.failures = this.state.failureTimestamps.length;
	}
}

// ============================================================================
// Circuit Breaker Manager
// ============================================================================

/**
 * Manages circuit breakers for all providers
 */
export class CircuitBreakerManager {
	private breakers = new Map<StreamingProviderId, CircuitBreaker>();
	private defaultConfig: Partial<CircuitBreakerConfig>;

	constructor(defaultConfig?: Partial<CircuitBreakerConfig>) {
		this.defaultConfig = defaultConfig ?? {};
	}

	/**
	 * Get or create a circuit breaker for a provider
	 */
	get(providerId: StreamingProviderId, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
		let breaker = this.breakers.get(providerId);
		if (!breaker) {
			breaker = new CircuitBreaker(providerId, { ...this.defaultConfig, ...config });
			this.breakers.set(providerId, breaker);
		}
		return breaker;
	}

	/**
	 * Check if a provider's circuit allows requests
	 */
	shouldAllow(providerId: StreamingProviderId): boolean {
		return this.get(providerId).shouldAllow();
	}

	/**
	 * Record success for a provider
	 */
	recordSuccess(providerId: StreamingProviderId, durationMs?: number): void {
		this.get(providerId).recordSuccess(durationMs);
	}

	/**
	 * Record failure for a provider
	 */
	recordFailure(providerId: StreamingProviderId, durationMs?: number): void {
		this.get(providerId).recordFailure(durationMs);
	}

	/**
	 * Get all circuit breaker states
	 */
	getAllStates(): Map<StreamingProviderId, ExtendedCircuitState> {
		const states = new Map<StreamingProviderId, ExtendedCircuitState>();
		for (const [id, breaker] of this.breakers) {
			states.set(id, breaker.getState());
		}
		return states;
	}

	/**
	 * Reset a specific provider's circuit
	 */
	reset(providerId: StreamingProviderId): boolean {
		const breaker = this.breakers.get(providerId);
		if (breaker) {
			breaker.forceClose();
			return true;
		}
		return false;
	}

	/**
	 * Reset all circuit breakers
	 */
	resetAll(): void {
		for (const breaker of this.breakers.values()) {
			breaker.forceClose();
		}
	}

	/**
	 * Cleanup all resources
	 */
	destroy(): void {
		for (const breaker of this.breakers.values()) {
			breaker.destroy();
		}
		this.breakers.clear();
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let managerInstance: CircuitBreakerManager | null = null;

/**
 * Get the global circuit breaker manager
 */
export function getCircuitBreakerManager(): CircuitBreakerManager {
	if (!managerInstance) {
		managerInstance = new CircuitBreakerManager();
	}
	return managerInstance;
}

/**
 * Create a new circuit breaker manager with custom config
 */
export function createCircuitBreakerManager(
	config?: Partial<CircuitBreakerConfig>
): CircuitBreakerManager {
	return new CircuitBreakerManager(config);
}
