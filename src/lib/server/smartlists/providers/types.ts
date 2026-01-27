/**
 * External List Provider Types
 *
 * Type definitions for external list providers that fetch items from
 * third-party sources like JSON URLs, Trakt lists, etc.
 */

/**
 * Represents a single item from an external list
 */
export interface ExternalListItem {
	/** TMDB ID (preferred identifier) */
	tmdbId?: number;

	/** IMDB ID (will be resolved to TMDB ID if tmdbId not provided) */
	imdbId?: string;

	/** Title for display and TMDB search fallback */
	title: string;

	/** Release year (optional, helps with TMDB search) */
	year?: number;

	/** Poster image path/URL */
	posterPath?: string | null;

	/** Overview/description */
	overview?: string;

	/** TMDB vote average */
	voteAverage?: number;

	/** TMDB vote count */
	voteCount?: number;

	/** Genre IDs from TMDB */
	genreIds?: number[];

	/** Original language */
	originalLanguage?: string;
}

/**
 * Configuration for external JSON list sources
 */
export interface ExternalJsonConfig {
	/** URL to fetch the JSON list from */
	url: string;

	/** Optional headers for authentication or other purposes */
	headers?: Record<string, string>;
}

/**
 * Configuration for Trakt list sources
 */
export interface TraktListConfig {
	/** Trakt list ID or slug */
	listId: string;

	/** Username for user lists */
	username?: string;

	/** Trakt API key (optional, for private lists) */
	apiKey?: string;
}

/**
 * Union type for all external source configurations
 */
export type ExternalSourceConfig = ExternalJsonConfig | TraktListConfig | Record<string, unknown>;

/**
 * Result from fetching an external list
 */
export interface ExternalListResult {
	/** Items fetched from the external source */
	items: ExternalListItem[];

	/** Total count (may differ from items.length if some failed to parse) */
	totalCount: number;

	/** Number of items that failed to parse/resolve */
	failedCount: number;

	/** Any error message from the fetch operation */
	error?: string;
}

/**
 * Interface that all external list providers must implement
 */
export interface ExternalListProvider {
	/** Provider type identifier */
	readonly type: string;

	/** Human-readable provider name */
	readonly name: string;

	/**
	 * Validate the configuration for this provider
	 * @returns true if config is valid, false otherwise
	 */
	validateConfig(config: unknown): boolean;

	/**
	 * Fetch items from the external source
	 * @param config Provider-specific configuration
	 * @param mediaType 'movie' or 'tv' - used for ID resolution context
	 * @returns Promise resolving to the list result
	 */
	fetchItems(config: unknown, mediaType: 'movie' | 'tv'): Promise<ExternalListResult>;
}
