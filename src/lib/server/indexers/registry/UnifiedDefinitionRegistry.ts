/**
 * Unified Indexer Definition Registry
 *
 * This module provides a centralized registry for all indexer definitions,
 * unifying the handling of:
 * - Native TypeScript indexers
 * - YAML-based indexer definitions
 * - Streaming indexers
 *
 * All definitions are converted to a common IndexerDefinition format that
 * uses the new unified type system.
 */

import type {
	IndexerDefinition,
	IndexerProtocol,
	AuthMethod,
	DefinitionAuthConfig,
	SettingField,
	IndexerCapabilities
} from '../types';

// =============================================================================
// REGISTRY TYPES
// =============================================================================

/**
 * Registration source for tracking where a definition came from
 */
export type DefinitionSource = 'native' | 'yaml' | 'builtin' | 'user';

/**
 * A complete indexer definition with all metadata
 */
export interface RegisteredDefinition {
	/** The full definition */
	definition: IndexerDefinition;
	/** Source of this definition */
	source: DefinitionSource;
	/** When this was registered/loaded */
	registeredAt: Date;
	/** Whether this is enabled by default */
	enabledByDefault: boolean;
	/** Factory function for creating instances (if native) */
	factory?: IndexerFactory;
	/** Validation errors if any */
	validationErrors?: string[];
}

/**
 * Factory function for creating indexer instances
 */
export type IndexerFactory<T = unknown> = (config: T) => Promise<unknown> | unknown;

/**
 * Filter options for querying the registry
 */
export interface DefinitionFilter {
	/** Filter by protocol */
	protocol?: IndexerProtocol | IndexerProtocol[];
	/** Filter by access type */
	accessType?: 'public' | 'semi-private' | 'private';
	/** Filter by auth method */
	authMethod?: AuthMethod | AuthMethod[];
	/** Filter by source */
	source?: DefinitionSource | DefinitionSource[];
	/** Search by name or description */
	search?: string;
	/** Only enabled definitions */
	enabledOnly?: boolean;
	/** Include internal/hidden definitions */
	includeInternal?: boolean;
}

// =============================================================================
// REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * Central registry for all indexer definitions
 */
export class UnifiedDefinitionRegistry {
	private definitions: Map<string, RegisteredDefinition> = new Map();
	private byProtocol: Map<IndexerProtocol, Set<string>> = new Map();
	private bySource: Map<DefinitionSource, Set<string>> = new Map();

	constructor() {
		// Initialize protocol indexes
		this.byProtocol.set('torrent', new Set());
		this.byProtocol.set('usenet', new Set());
		this.byProtocol.set('streaming', new Set());

		// Initialize source indexes
		this.bySource.set('native', new Set());
		this.bySource.set('yaml', new Set());
		this.bySource.set('builtin', new Set());
		this.bySource.set('user', new Set());
	}

	/**
	 * Register a definition
	 */
	register(
		definition: IndexerDefinition,
		source: DefinitionSource,
		options: {
			factory?: IndexerFactory;
			enabledByDefault?: boolean;
			replace?: boolean;
		} = {}
	): boolean {
		const id = definition.id;

		// Check for existing
		if (this.definitions.has(id) && !options.replace) {
			return false;
		}

		// Create registered entry
		const registered: RegisteredDefinition = {
			definition,
			source,
			registeredAt: new Date(),
			enabledByDefault: options.enabledByDefault ?? true,
			factory: options.factory
		};

		// Validate
		registered.validationErrors = this.validateDefinition(definition);

		// Store in main map
		this.definitions.set(id, registered);

		// Update indexes
		this.byProtocol.get(definition.protocol)?.add(id);
		this.bySource.get(source)?.add(id);

		return true;
	}

	/**
	 * Unregister a definition
	 */
	unregister(id: string): boolean {
		const registered = this.definitions.get(id);
		if (!registered) {
			return false;
		}

		// Remove from indexes
		this.byProtocol.get(registered.definition.protocol)?.delete(id);
		this.bySource.get(registered.source)?.delete(id);

		// Remove from main map
		this.definitions.delete(id);

		return true;
	}

	/**
	 * Get a definition by ID
	 */
	get(id: string): RegisteredDefinition | undefined {
		return this.definitions.get(id);
	}

	/**
	 * Get the raw definition by ID
	 */
	getDefinition(id: string): IndexerDefinition | undefined {
		return this.definitions.get(id)?.definition;
	}

	/**
	 * Check if a definition exists
	 */
	has(id: string): boolean {
		return this.definitions.has(id);
	}

	/**
	 * Get all definitions matching a filter
	 */
	query(filter: DefinitionFilter = {}): RegisteredDefinition[] {
		let results = Array.from(this.definitions.values());

		// Filter by protocol
		if (filter.protocol) {
			const protocols = Array.isArray(filter.protocol) ? filter.protocol : [filter.protocol];
			results = results.filter((r) => protocols.includes(r.definition.protocol));
		}

		// Filter by access type
		if (filter.accessType) {
			results = results.filter((r) => r.definition.accessType === filter.accessType);
		}

		// Filter by auth method
		if (filter.authMethod) {
			const methods = Array.isArray(filter.authMethod) ? filter.authMethod : [filter.authMethod];
			results = results.filter((r) => {
				const authMethod = r.definition.auth?.method ?? 'none';
				return methods.includes(authMethod);
			});
		}

		// Filter by source
		if (filter.source) {
			const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
			results = results.filter((r) => sources.includes(r.source));
		}

		// Search by name/description
		if (filter.search) {
			const search = filter.search.toLowerCase();
			results = results.filter(
				(r) =>
					r.definition.name.toLowerCase().includes(search) ||
					r.definition.description?.toLowerCase().includes(search)
			);
		}

		// Filter by enabled status
		if (filter.enabledOnly) {
			results = results.filter((r) => r.enabledByDefault);
		}

		// Exclude internal definitions unless requested
		if (!filter.includeInternal) {
			results = results.filter((r) => !r.definition.internal);
		}

		return results;
	}

	/**
	 * Get all definition IDs
	 */
	getAllIds(): string[] {
		return Array.from(this.definitions.keys());
	}

	/**
	 * Get definitions by protocol
	 */
	getByProtocol(protocol: IndexerProtocol): RegisteredDefinition[] {
		const ids = this.byProtocol.get(protocol);
		if (!ids) return [];
		return Array.from(ids)
			.map((id) => this.definitions.get(id))
			.filter((d): d is RegisteredDefinition => d !== undefined);
	}

	/**
	 * Get definitions by source
	 */
	getBySource(source: DefinitionSource): RegisteredDefinition[] {
		const ids = this.bySource.get(source);
		if (!ids) return [];
		return Array.from(ids)
			.map((id) => this.definitions.get(id))
			.filter((d): d is RegisteredDefinition => d !== undefined);
	}

	/**
	 * Get count by protocol
	 */
	getCountByProtocol(): Record<IndexerProtocol, number> {
		return {
			torrent: this.byProtocol.get('torrent')?.size ?? 0,
			usenet: this.byProtocol.get('usenet')?.size ?? 0,
			streaming: this.byProtocol.get('streaming')?.size ?? 0
		};
	}

	/**
	 * Get count by source
	 */
	getCountBySource(): Record<DefinitionSource, number> {
		return {
			native: this.bySource.get('native')?.size ?? 0,
			yaml: this.bySource.get('yaml')?.size ?? 0,
			builtin: this.bySource.get('builtin')?.size ?? 0,
			user: this.bySource.get('user')?.size ?? 0
		};
	}

	/**
	 * Get total count
	 */
	get size(): number {
		return this.definitions.size;
	}

	/**
	 * Clear all definitions
	 */
	clear(): void {
		this.definitions.clear();
		for (const set of this.byProtocol.values()) set.clear();
		for (const set of this.bySource.values()) set.clear();
	}

	/**
	 * Validate a definition
	 */
	private validateDefinition(definition: IndexerDefinition): string[] {
		const errors: string[] = [];

		if (!definition.id) {
			errors.push('Definition ID is required');
		}
		if (!definition.name) {
			errors.push('Definition name is required');
		}
		if (!definition.protocol) {
			errors.push('Protocol is required');
		}
		if (!['torrent', 'usenet', 'streaming'].includes(definition.protocol)) {
			errors.push(`Invalid protocol: ${definition.protocol}`);
		}
		if (
			definition.accessType &&
			!['public', 'semi-private', 'private'].includes(definition.accessType)
		) {
			errors.push(`Invalid access type: ${definition.accessType}`);
		}

		// Validate auth config if present
		if (definition.auth) {
			if (
				!['none', 'cookie', 'apikey', 'form', 'passkey', 'basic'].includes(definition.auth.method)
			) {
				errors.push(`Invalid auth method: ${definition.auth.method}`);
			}
		}

		return errors;
	}
}

// =============================================================================
// SINGLETON
// =============================================================================

let registryInstance: UnifiedDefinitionRegistry | null = null;

/**
 * Get the global registry instance
 */
export function getUnifiedRegistry(): UnifiedDefinitionRegistry {
	if (!registryInstance) {
		registryInstance = new UnifiedDefinitionRegistry();
	}
	return registryInstance;
}

/**
 * Reset the registry (for testing)
 */
export function resetUnifiedRegistry(): void {
	registryInstance = null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a minimal native definition for a new indexer
 */
export function createDefinition(
	id: string,
	name: string,
	protocol: IndexerProtocol,
	options: Partial<Omit<IndexerDefinition, 'id' | 'name' | 'protocol' | 'source'>> = {}
): IndexerDefinition {
	const defaultCapabilities: IndexerCapabilities = {
		search: { available: true, supportedParams: ['q'] },
		categories: new Map(),
		supportsPagination: false,
		supportsInfoHash: false,
		limitMax: 100,
		limitDefault: 25
	};

	return {
		source: 'native',
		id,
		name,
		protocol,
		description: options.description ?? '',
		accessType: options.accessType ?? 'public',
		authMethod: options.authMethod ?? 'none',
		siteUrl: options.siteUrl ?? '',
		alternateUrls: options.alternateUrls ?? [],
		urls: options.urls ?? [],
		language: options.language ?? 'en-US',
		settings: options.settings ?? [],
		auth: options.auth,
		capabilities: options.capabilities ?? defaultCapabilities,
		...options
	} as IndexerDefinition;
}

/**
 * Convert a legacy definition to the new format
 */
export function convertLegacyDefinition(legacy: {
	id: string;
	name: string;
	description?: string;
	protocol: string;
	type?: string;
	settings?: Array<{
		name: string;
		type: string;
		label?: string;
		required?: boolean;
		default?: string;
		helpText?: string;
	}>;
	urls?: string[];
	siteUrl?: string;
}): IndexerDefinition {
	// Determine auth method from settings
	let auth: DefinitionAuthConfig | undefined;
	const settings = legacy.settings ?? [];

	const hasCookie = settings.some((s) => s.name === 'cookie');
	const hasApiKey = settings.some((s) => s.name === 'apiKey' || s.name === 'apikey');
	const hasPasskey = settings.some((s) => s.name === 'passkey');
	const hasUsername = settings.some((s) => s.name === 'username');
	const hasPassword = settings.some((s) => s.name === 'password');

	if (hasCookie) {
		auth = { method: 'cookie', cookieSelector: 'cookie' };
	} else if (hasApiKey) {
		auth = {
			method: 'apikey',
			keyName: 'apikey',
			placement: 'header'
		};
	} else if (hasPasskey) {
		auth = { method: 'passkey', passkeyParam: 'passkey' };
	} else if (hasUsername && hasPassword) {
		auth = {
			method: 'form',
			loginPath: '/login',
			usernameField: 'username',
			passwordField: 'password'
		};
	}

	// Convert settings
	const convertedSettings: SettingField[] = settings.map((s) => ({
		name: s.name,
		type: s.type as SettingField['type'],
		label: s.label ?? s.name,
		required: s.required ?? false,
		default: s.default,
		helpText: s.helpText
	}));

	// Determine access type
	let accessType: 'public' | 'semi-private' | 'private' = 'public';
	if (legacy.type === 'private' || hasCookie || hasUsername) {
		accessType = 'private';
	} else if (legacy.type === 'semi-private' || hasApiKey || hasPasskey) {
		accessType = 'semi-private';
	}

	const defaultCapabilities: IndexerCapabilities = {
		search: { available: true, supportedParams: ['q'] },
		categories: new Map(),
		supportsPagination: false,
		supportsInfoHash: false,
		limitMax: 100,
		limitDefault: 25
	};

	return {
		source: 'native' as const,
		id: legacy.id,
		name: legacy.name,
		description: legacy.description ?? '',
		protocol: legacy.protocol as IndexerProtocol,
		accessType,
		authMethod: auth?.method ?? 'none',
		siteUrl: legacy.siteUrl ?? legacy.urls?.[0] ?? '',
		alternateUrls: legacy.urls ?? [],
		urls: legacy.urls ?? (legacy.siteUrl ? [legacy.siteUrl] : []),
		language: 'en-US',
		settings: convertedSettings,
		capabilities: defaultCapabilities,
		auth
	};
}
