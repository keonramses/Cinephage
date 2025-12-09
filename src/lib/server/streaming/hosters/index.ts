/**
 * Hoster Infrastructure
 *
 * Manages embed URL resolution through various hosters.
 * Hosters extract actual stream URLs from embed URLs returned by providers.
 */

import { logger } from '$lib/logging';
import { getEncDecClient } from '../enc-dec';
import { MegaupHoster } from './megaup';
import { RapidshareHoster } from './rapidshare';
import type { HosterResult, HosterId, IHoster } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Hoster Manager
// ============================================================================

/**
 * Manages hosters and resolves embed URLs
 */
class HosterManager {
	private hosters: Map<HosterId, IHoster> = new Map();
	private initialized = false;

	/**
	 * Initialize all hosters
	 */
	private initialize(): void {
		if (this.initialized) return;

		const encDecClient = getEncDecClient();

		// Register all hosters
		const hosterInstances: IHoster[] = [
			new MegaupHoster(encDecClient),
			new RapidshareHoster(encDecClient)
		];

		for (const hoster of hosterInstances) {
			this.hosters.set(hoster.config.id, hoster);
		}

		logger.info('Hosters initialized', {
			count: this.hosters.size,
			hosters: Array.from(this.hosters.keys()),
			...streamLog
		});

		this.initialized = true;
	}

	/**
	 * Find a hoster that can handle the given URL
	 */
	findHoster(url: string): IHoster | undefined {
		this.initialize();

		for (const hoster of this.hosters.values()) {
			if (hoster.canHandle(url)) {
				return hoster;
			}
		}

		return undefined;
	}

	/**
	 * Check if any hoster can handle the given URL
	 */
	canHandle(url: string): boolean {
		return this.findHoster(url) !== undefined;
	}

	/**
	 * Resolve an embed URL to actual stream sources
	 *
	 * @param embedUrl - The embed URL to resolve
	 * @returns Hoster result with stream sources, or null if no hoster can handle the URL
	 */
	async resolve(embedUrl: string): Promise<HosterResult | null> {
		const hoster = this.findHoster(embedUrl);

		if (!hoster) {
			logger.debug('No hoster found for URL', { embedUrl, ...streamLog });
			return null;
		}

		logger.debug('Resolving embed with hoster', {
			hoster: hoster.config.id,
			embedUrl,
			...streamLog
		});

		return hoster.resolve(embedUrl);
	}

	/**
	 * Get all registered hosters
	 */
	getAllHosters(): IHoster[] {
		this.initialize();
		return Array.from(this.hosters.values());
	}

	/**
	 * Get a hoster by ID
	 */
	getHoster(id: HosterId): IHoster | undefined {
		this.initialize();
		return this.hosters.get(id);
	}

	/**
	 * Get all domains handled by hosters
	 */
	getAllDomains(): string[] {
		this.initialize();
		const domains: string[] = [];
		for (const hoster of this.hosters.values()) {
			domains.push(...hoster.config.domains);
		}
		return domains;
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let managerInstance: HosterManager | null = null;

/**
 * Get the singleton HosterManager instance
 */
export function getHosterManager(): HosterManager {
	if (!managerInstance) {
		managerInstance = new HosterManager();
	}
	return managerInstance;
}

/**
 * Convenience function: Check if any hoster can handle the URL
 */
export function canResolveEmbed(url: string): boolean {
	return getHosterManager().canHandle(url);
}

/**
 * Convenience function: Resolve an embed URL to stream sources
 */
export async function resolveEmbed(embedUrl: string): Promise<HosterResult | null> {
	return getHosterManager().resolve(embedUrl);
}

// Re-export types
export type { HosterResult, HosterId, HosterConfig, HosterStreamSource, IHoster } from './types';
export { MegaupHoster } from './megaup';
export { RapidshareHoster } from './rapidshare';
