/**
 * Provider Types
 *
 * Type definitions for the streaming provider abstraction layer.
 * These types define the interface between the orchestrator and
 * individual provider implementations.
 */

// ============================================================================
// Provider Identifiers
// ============================================================================

/**
 * All supported streaming provider IDs
 */
export type StreamingProviderId =
	| 'videasy'
	| 'vidlink'
	| 'xprime'
	| 'smashy'
	| 'hexa'
	| 'yflix'
	| 'mapple'
	| 'onetouchtv'
	| 'animekai'
	| 'kisskh';

/**
 * Media type for content search
 */
export type MediaType = 'movie' | 'tv';

/**
 * Content category support
 */
export type ContentCategory = 'movies' | 'tv' | 'anime' | 'asian-drama';

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Static configuration for a provider
 */
export interface ProviderConfig {
	/** Unique provider identifier */
	id: StreamingProviderId;

	/** Human-readable provider name */
	name: string;

	/** Priority order (lower = higher priority) */
	priority: number;

	/** Whether this provider is enabled by default */
	enabledByDefault: boolean;

	/** Content type support flags */
	supportsMovies: boolean;
	supportsTv: boolean;
	supportsAnime: boolean;
	supportsAsianDrama: boolean;

	/** Whether streams require the HLS proxy */
	requiresProxy: boolean;

	/** Referer header to use for stream requests */
	referer: string;

	/** Request timeout in milliseconds */
	timeout: number;
}

// ============================================================================
// Search Parameters
// ============================================================================

/**
 * Parameters for searching/extracting streams
 */
export interface SearchParams {
	/** TMDB ID (required) */
	tmdbId: string;

	/** Media type */
	type: MediaType;

	/** IMDB ID (optional, some providers use it) */
	imdbId?: string;

	/** Content title (optional, some providers use it) */
	title?: string;

	/** Release year (optional) */
	year?: number;

	/** Season number for TV shows */
	season?: number;

	/** Episode number for TV shows */
	episode?: number;

	/** Alternative titles for content lookup (e.g., different language titles) */
	alternativeTitles?: string[];

	/** MyAnimeList ID (for anime - enables direct lookup) */
	malId?: number;

	/** AniList ID (for anime - enables direct lookup) */
	anilistId?: number;
}

// ============================================================================
// Stream Results
// ============================================================================

/**
 * A single stream/source from a provider
 */
export interface StreamResult {
	/** Stream URL (HLS/M3U8/MP4) */
	url: string;

	/** Quality label (e.g., '1080p', '720p', '4K') */
	quality: string;

	/** Display title for the stream */
	title: string;

	/** Stream type */
	streamType: 'hls' | 'm3u8' | 'mp4';

	/** Referer header needed to play the stream */
	referer: string;

	/** Server/source name within the provider */
	server?: string;

	/** Language of the content */
	language?: string;

	/** Associated subtitle tracks */
	subtitles?: SubtitleTrack[];

	/** Additional headers needed for playback */
	headers?: Record<string, string>;
}

/**
 * A subtitle track associated with a stream
 */
export interface SubtitleTrack {
	/** Subtitle file URL */
	url: string;

	/** Language code (e.g., 'en', 'es') */
	language: string;

	/** Display label (e.g., 'English', 'Spanish') */
	label: string;
}

// ============================================================================
// Provider Results
// ============================================================================

/**
 * Result from a provider extraction attempt
 */
export interface ProviderResult {
	/** Whether extraction was successful */
	success: boolean;

	/** Extracted streams (empty if failed) */
	streams: StreamResult[];

	/** Provider that produced this result */
	provider: StreamingProviderId;

	/** Error message if failed */
	error?: string;

	/** Duration of extraction in milliseconds */
	durationMs?: number;
}

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * A server/source within a provider (e.g., Videasy has 15 servers)
 */
export interface ServerConfig {
	/** Server identifier */
	id: string;

	/** Display name */
	name: string;

	/** Content language */
	language: string;

	/** Whether this server only supports movies */
	movieOnly?: boolean;

	/** Whether this server only supports TV shows */
	tvOnly?: boolean;

	/** Whether this server is enabled */
	enabled?: boolean;
}

// ============================================================================
// Orchestrator Types
// ============================================================================

/**
 * Options for the orchestrator's extractStreams function
 */
export interface ExtractOptions extends SearchParams {
	/** Specific provider to use (skip fallback) */
	provider?: StreamingProviderId;

	/** Whether to use parallel extraction (default: true when multiple providers available) */
	parallel?: boolean;
}

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

// ============================================================================
// Provider Interface (for type-checking implementations)
// ============================================================================

/**
 * Interface that all providers must implement
 */
export interface IStreamProvider {
	/** Provider configuration */
	readonly config: ProviderConfig;

	/**
	 * Extract streams for the given content
	 * @param params Search parameters
	 * @returns Provider result with streams or error
	 */
	extract(params: SearchParams): Promise<ProviderResult>;

	/**
	 * Check if this provider can handle the given content
	 * @param params Search parameters
	 * @returns true if provider supports this content type
	 */
	canHandle(params: SearchParams): boolean;
}
