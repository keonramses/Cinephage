/**
 * Provider Registry
 *
 * Central registry for managing streaming providers with:
 * - Provider registration and lookup
 * - Capability-based provider selection
 * - Health-aware provider prioritization
 */

import { logger } from '$lib/logging';
import type {
	IStreamProvider,
	StreamingProviderId,
	ProviderCapabilities,
	SearchParams,
	ProviderHealth
} from '../types';
import { getHealthTracker } from './health';
import { getCircuitBreakerManager } from './circuitBreaker';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Provider Registry Class
// ============================================================================

/**
 * Central registry for streaming providers
 */
export class ProviderRegistry {
	private providers = new Map<StreamingProviderId, IStreamProvider>();
	private initialized = false;

	// --------------------------------------------------------------------------
	// Registration
	// --------------------------------------------------------------------------

	/**
	 * Register a provider
	 */
	register(provider: IStreamProvider): void {
		this.providers.set(provider.config.id, provider);
		logger.debug('Provider registered', {
			id: provider.config.id,
			name: provider.config.name,
			...streamLog
		});
	}

	/**
	 * Unregister a provider
	 */
	unregister(providerId: StreamingProviderId): boolean {
		const deleted = this.providers.delete(providerId);
		if (deleted) {
			logger.debug('Provider unregistered', { id: providerId, ...streamLog });
		}
		return deleted;
	}

	/**
	 * Register multiple providers
	 */
	registerAll(providers: IStreamProvider[]): void {
		for (const provider of providers) {
			this.register(provider);
		}
	}

	/**
	 * Mark registry as initialized
	 */
	markInitialized(): void {
		this.initialized = true;
		logger.info('Provider registry initialized', {
			count: this.providers.size,
			providers: Array.from(this.providers.keys()),
			...streamLog
		});
	}

	/**
	 * Check if registry is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	// --------------------------------------------------------------------------
	// Retrieval
	// --------------------------------------------------------------------------

	/**
	 * Get a provider by ID
	 */
	get(id: StreamingProviderId): IStreamProvider | undefined {
		return this.providers.get(id);
	}

	/**
	 * Get all registered providers
	 */
	getAll(): IStreamProvider[] {
		return Array.from(this.providers.values());
	}

	/**
	 * Get all provider IDs
	 */
	getAllIds(): StreamingProviderId[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Get count of registered providers
	 */
	count(): number {
		return this.providers.size;
	}

	/**
	 * Check if a provider is registered
	 */
	has(id: StreamingProviderId): boolean {
		return this.providers.has(id);
	}

	// --------------------------------------------------------------------------
	// Filtering
	// --------------------------------------------------------------------------

	/**
	 * Get all enabled providers (enabledByDefault = true)
	 */
	getEnabled(): IStreamProvider[] {
		return this.getAll().filter((p) => p.config.enabledByDefault);
	}

	/**
	 * Get providers by capability
	 */
	getByCapability(capability: keyof ProviderCapabilities): IStreamProvider[] {
		return this.getAll().filter((p) => {
			const caps = p.config.capabilities;
			if (caps) {
				return caps[capability];
			}
			// Fallback to config flags for backward compatibility
			switch (capability) {
				case 'supportsMovies':
					return p.config.supportsMovies;
				case 'supportsTv':
					return p.config.supportsTv;
				case 'supportsAnime':
					return p.config.supportsAnime;
				case 'supportsAsianDrama':
					return p.config.supportsAsianDrama;
				default:
					return false;
			}
		});
	}

	/**
	 * Get providers that can handle the given content
	 */
	getCompatible(params: SearchParams): IStreamProvider[] {
		return this.getAll().filter((p) => p.canHandle(params));
	}

	/**
	 * Get enabled providers that can handle the given content
	 */
	getEnabledCompatible(params: SearchParams): IStreamProvider[] {
		return this.getEnabled().filter((p) => p.canHandle(params));
	}

	// --------------------------------------------------------------------------
	// Health-aware Selection
	// --------------------------------------------------------------------------

	/**
	 * Get healthy providers (not circuit-broken)
	 */
	getHealthy(minScore?: number): IStreamProvider[] {
		const cbManager = getCircuitBreakerManager();
		const healthTracker = getHealthTracker();
		const threshold = minScore ?? 0;

		return this.getEnabled().filter((p) => {
			// Check circuit breaker
			if (!cbManager.shouldAllow(p.config.id)) {
				return false;
			}

			// Check health score
			if (threshold > 0) {
				const score = healthTracker.getProviderScore(p.config.id);
				return score >= threshold;
			}

			return true;
		});
	}

	/**
	 * Get providers sorted by health and priority
	 *
	 * Sorting order:
	 * 1. Circuit breaker state (open providers last)
	 * 2. Health score (higher first)
	 * 3. Static priority (lower first)
	 */
	getPrioritized(params: SearchParams, preferredLanguages?: string[]): IStreamProvider[] {
		const cbManager = getCircuitBreakerManager();
		const healthTracker = getHealthTracker();

		// Get compatible, enabled providers
		const providers = this.getEnabledCompatible(params);

		// Sort by multiple criteria
		return providers.sort((a, b) => {
			// 1. Circuit breaker state - open circuits go last
			const aOpen = !cbManager.shouldAllow(a.config.id);
			const bOpen = !cbManager.shouldAllow(b.config.id);
			if (aOpen !== bOpen) {
				return aOpen ? 1 : -1;
			}

			// 2. Health score - higher is better
			const aScore = healthTracker.getProviderScore(a.config.id);
			const bScore = healthTracker.getProviderScore(b.config.id);
			const scoreDiff = bScore - aScore;
			if (Math.abs(scoreDiff) > 10) {
				return scoreDiff;
			}

			// 3. Language preference match
			if (preferredLanguages?.length) {
				const aLangScore = this.calculateLanguageScore(a, preferredLanguages);
				const bLangScore = this.calculateLanguageScore(b, preferredLanguages);
				if (aLangScore !== bLangScore) {
					return bLangScore - aLangScore;
				}
			}

			// 4. Static priority - lower is better
			return a.config.priority - b.config.priority;
		});
	}

	/**
	 * Get prioritized providers for extraction
	 * Separates into compatible, skipped (circuit-broken), and unsupported
	 */
	getForExtraction(
		params: SearchParams,
		preferredLanguages?: string[]
	): {
		compatible: IStreamProvider[];
		skipped: IStreamProvider[];
		unsupported: IStreamProvider[];
	} {
		const cbManager = getCircuitBreakerManager();
		const enabled = this.getEnabled();

		const compatible: IStreamProvider[] = [];
		const skipped: IStreamProvider[] = [];
		const unsupported: IStreamProvider[] = [];

		for (const provider of enabled) {
			if (!provider.canHandle(params)) {
				unsupported.push(provider);
				continue;
			}

			if (!cbManager.shouldAllow(provider.config.id)) {
				skipped.push(provider);
				continue;
			}

			compatible.push(provider);
		}

		// Sort compatible providers by priority
		const healthTracker = getHealthTracker();
		compatible.sort((a, b) => {
			const aScore = healthTracker.getProviderScore(a.config.id);
			const bScore = healthTracker.getProviderScore(b.config.id);
			const scoreDiff = bScore - aScore;
			if (Math.abs(scoreDiff) > 10) {
				return scoreDiff;
			}

			if (preferredLanguages?.length) {
				const aLangScore = this.calculateLanguageScore(a, preferredLanguages);
				const bLangScore = this.calculateLanguageScore(b, preferredLanguages);
				if (aLangScore !== bLangScore) {
					return bLangScore - aLangScore;
				}
			}

			return a.config.priority - b.config.priority;
		});

		return { compatible, skipped, unsupported };
	}

	// --------------------------------------------------------------------------
	// Private Methods
	// --------------------------------------------------------------------------

	private calculateLanguageScore(provider: IStreamProvider, preferredLanguages: string[]): number {
		// Basic language scoring - can be enhanced per-provider
		// For now, just check if provider supports languages
		const caps = provider.config.capabilities;
		if (caps?.supportsLanguageSelection) {
			return 10;
		}
		return 0;
	}

	// --------------------------------------------------------------------------
	// Cleanup
	// --------------------------------------------------------------------------

	/**
	 * Clear all providers
	 */
	clear(): void {
		this.providers.clear();
		this.initialized = false;
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: ProviderRegistry | null = null;

/**
 * Get the global provider registry
 */
export function getProviderRegistry(): ProviderRegistry {
	if (!registryInstance) {
		registryInstance = new ProviderRegistry();
	}
	return registryInstance;
}

/**
 * Create a new provider registry
 */
export function createProviderRegistry(): ProviderRegistry {
	return new ProviderRegistry();
}
