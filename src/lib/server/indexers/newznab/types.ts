/**
 * Type definitions for Newznab API capabilities and responses.
 */

/**
 * Newznab search mode with supported parameters.
 */
export interface NewznabSearchMode {
	/** Whether this search mode is available */
	available: boolean;
	/** Supported parameters (e.g., 'q', 'imdbid', 'tvdbid', 'season', 'ep') */
	supportedParams: string[];
}

/**
 * Newznab category from capabilities response.
 */
export interface NewznabCategory {
	/** Category ID (e.g., '2000', '5040') */
	id: string;
	/** Category name (e.g., 'Movies', 'TV/HD') */
	name: string;
	/** Subcategories */
	subCategories?: NewznabCategory[];
}

/**
 * Newznab indexer capabilities.
 */
export interface NewznabCapabilities {
	/** Server information */
	server: {
		version?: string;
		title?: string;
		email?: string;
		url?: string;
	};
	/** Result limits */
	limits: {
		/** Default results per request */
		default: number;
		/** Maximum results per request */
		max: number;
	};
	/** Search modes and their supported parameters */
	searching: {
		/** Basic search (?t=search) */
		search: NewznabSearchMode;
		/** TV search (?t=tvsearch) */
		tvSearch: NewznabSearchMode;
		/** Movie search (?t=movie) */
		movieSearch: NewznabSearchMode;
		/** Audio search (?t=audio) */
		audioSearch: NewznabSearchMode;
		/** Book search (?t=book) */
		bookSearch: NewznabSearchMode;
	};
	/** Available categories */
	categories: NewznabCategory[];
	/** Raw XML for reference */
	rawXml?: string;
}

/**
 * Cached capabilities entry.
 */
export interface CachedCapabilities {
	/** The capabilities */
	capabilities: NewznabCapabilities;
	/** Cache expiry timestamp */
	expiresAt: number;
}
