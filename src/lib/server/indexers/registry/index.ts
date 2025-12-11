/**
 * Indexer Registry Module
 *
 * Provides the unified indexer definition registry system.
 */

export {
	UnifiedDefinitionRegistry,
	getUnifiedRegistry,
	resetUnifiedRegistry,
	createDefinition,
	convertLegacyDefinition,
	type RegisteredDefinition,
	type DefinitionSource,
	type DefinitionFilter,
	type IndexerFactory
} from './UnifiedDefinitionRegistry';
