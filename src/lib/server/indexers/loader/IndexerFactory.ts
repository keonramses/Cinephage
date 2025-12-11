/**
 * Indexer Factory
 *
 * Creates indexer instances from YAML definitions.
 * Uses a single interface regardless of the underlying definition.
 */

import type { IIndexer, IndexerConfig } from '../types';
import { YamlIndexer } from '../runtime/YamlIndexer';
import { YamlDefinitionLoader } from './YamlDefinitionLoader';
import { createChildLogger } from '$lib/logging';

const log = createChildLogger({ module: 'IndexerFactory' });

/**
 * Factory for creating indexer instances.
 */
export class IndexerFactory {
	private cache: Map<string, IIndexer> = new Map();
	private yamlLoader: YamlDefinitionLoader | null = null;

	/**
	 * Initialize the factory with the YAML loader.
	 * Must be called before creating indexers.
	 */
	async initialize(): Promise<void> {
		if (!this.yamlLoader) {
			this.yamlLoader = new YamlDefinitionLoader();
			await this.yamlLoader.loadAll();
		}
	}

	/**
	 * Create an indexer instance from database config.
	 */
	async createIndexer(config: IndexerConfig): Promise<IIndexer> {
		// Check cache first
		const cached = this.cache.get(config.id);
		if (cached) {
			return cached;
		}

		// Ensure loader is ready
		await this.initialize();

		// Create YAML indexer
		const indexer = this.createYamlIndexer(config);

		// Cache and return
		this.cache.set(config.id, indexer);
		log.debug('Created indexer', {
			id: config.id,
			definitionId: config.definitionId
		});

		return indexer;
	}

	/**
	 * Create a YAML indexer.
	 */
	private createYamlIndexer(config: IndexerConfig): IIndexer {
		if (!this.yamlLoader) {
			throw new Error('YAML loader not initialized. Call initialize() first.');
		}

		const definition = this.yamlLoader.getDefinition(config.definitionId);
		if (!definition) {
			throw new Error(`YAML definition not found: ${config.definitionId}`);
		}

		return new YamlIndexer({
			config,
			definition,
			rateLimit: definition.requestdelay
				? { requests: 1, periodMs: definition.requestdelay * 1000 }
				: undefined
		});
	}

	/**
	 * Check if this factory can create an indexer for the given definition.
	 */
	canCreate(definitionId: string): boolean {
		return this.yamlLoader?.hasDefinition(definitionId) ?? false;
	}

	/**
	 * Remove an indexer from the cache.
	 */
	removeFromCache(id: string): void {
		this.cache.delete(id);
	}

	/**
	 * Clear the entire cache.
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get a cached indexer if it exists.
	 */
	getCached(id: string): IIndexer | undefined {
		return this.cache.get(id);
	}
}

// ============================================================================
// Singleton
// ============================================================================

let instance: IndexerFactory | null = null;

/**
 * Get the singleton factory instance.
 */
export function getIndexerFactory(): IndexerFactory {
	if (!instance) {
		instance = new IndexerFactory();
	}
	return instance;
}
