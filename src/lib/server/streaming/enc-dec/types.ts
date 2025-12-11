/**
 * Types for the EncDec API client (enc-dec.app)
 *
 * This module defines request/response types for the encryption-as-a-service
 * API that handles all provider-specific encryption and decryption.
 */

// ============================================================================
// Provider Identifiers
// ============================================================================

/**
 * Providers that support encryption endpoints (GET /api/enc-{provider})
 */
export type EncryptionProvider =
	| 'kai' // AnimeKai
	| 'movies-flix' // YFlix/1Movies
	| 'vidlink' // Vidlink
	| 'vidstack' // Smashystream
	| 'xprime' // XPrime (turnstile token only)
	| 'kisskh' // KissKH
	| 'mapple'; // Mapple (session only)

/**
 * Providers that support decryption endpoints (POST /api/dec-{provider})
 */
export type DecryptionProvider =
	| 'kai' // AnimeKai
	| 'movies-flix' // YFlix/1Movies
	| 'videasy' // Videasy
	| 'vidstack' // Smashystream
	| 'xprime' // XPrime
	| 'hexa' // Hexa
	| 'kisskh' // KissKH
	| 'onetouchtv' // OneTouchTV
	| 'mega' // Megaup hoster
	| 'rapid'; // Rapidshare hoster

// ============================================================================
// Request Types
// ============================================================================

/**
 * Base payload for decryption requests
 */
export interface DecryptPayload {
	/** Encrypted text to decrypt */
	text: string;
}

/**
 * Videasy decryption payload
 */
export interface VideasyDecryptPayload extends DecryptPayload {
	/** TMDB ID (required for videasy) */
	id: string;
}

/**
 * Vidstack/Smashystream decryption payload
 */
export interface VidstackDecryptPayload extends DecryptPayload {
	/** Decryption type: '1' for smashystream, '2' for videofsh/short2embed */
	type: '1' | '2';
}

/**
 * Hexa decryption payload
 */
export interface HexaDecryptPayload extends DecryptPayload {
	/** The 32-byte hex key used in the X-Api-Key header */
	key: string;
}

/**
 * KissKH decryption payload (for subtitles)
 */
export interface KissKHDecryptPayload {
	/** Subtitle URL to decrypt */
	url: string;
}

/**
 * Megaup hoster decryption payload
 */
export interface MegaupDecryptPayload {
	/** Encrypted text from /media/{id} endpoint */
	text: string;
	/** User-Agent header value (required for proper decryption) */
	agent: string;
}

/**
 * Rapidshare hoster decryption payload
 */
export interface RapidshareDecryptPayload {
	/** Encrypted text from /media/{id} endpoint */
	text: string;
	/** User-Agent header value (required for proper decryption) */
	agent: string;
}

/**
 * KissKH encryption parameters
 */
export interface KissKHEncryptParams {
	/** Content ID */
	text: string;
	/** Type: 'vid' for video, 'sub' for subtitles */
	type: 'vid' | 'sub';
}

/**
 * HTML parsing payload
 */
export interface ParseHtmlPayload {
	/** HTML content to parse */
	text: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface EncDecResponse<T> {
	result: T;
}

/**
 * Simple string result (most encrypt/decrypt operations)
 */
export type StringResult = EncDecResponse<string>;

/**
 * Vidstack token response (enc-vidstack)
 */
export interface VidstackTokenResult {
	result: {
		token: string;
		user_id: string;
	};
}

/**
 * Mapple session response (enc-mapple)
 * Includes both sessionId and the dynamic Next-Action hash
 */
export interface MappleSessionResult {
	result: {
		sessionId: string;
		nextAction: string;
	};
}

/**
 * Parsed HTML structure (from parse-html endpoint)
 * Structure varies by provider, but generally has nested objects
 */
export interface ParsedHtmlResult {
	result: Record<string, Record<string, Record<string, string>>>;
}

// ============================================================================
// Provider-Specific Response Types
// ============================================================================

/**
 * Videasy decrypted response
 */
export interface VideasyStream {
	stream?: string;
	file?: string;
	subtitles?: Array<{
		url: string;
		lang: string;
	}>;
}

/**
 * Vidlink response structure (returns JSON directly, no decrypt needed)
 */
export interface VidlinkResponse {
	stream?: {
		playlist: string;
		subtitles?: Array<{
			file: string;
			label: string;
			kind: string;
		}>;
	};
	status?: boolean;
}

/**
 * XPrime decrypted response
 */
export interface XPrimeStream {
	stream?: string;
	url?: string;
	subtitles?: Array<{
		url: string;
		label: string;
		lang: string;
	}>;
}

/**
 * Hexa decrypted response
 */
export interface HexaStream {
	stream?: string;
	file?: string;
	subtitles?: Array<{
		url: string;
		lang: string;
	}>;
}

/**
 * Smashystream response after initial token request
 */
export interface SmashyStreamPlayerResponse {
	data: string; // Format: "host/#id" for type 1, or object for type 2
	status?: boolean;
}

/**
 * Smashystream type 2 data structure
 */
export interface SmashyStreamType2Data {
	data: {
		sources: Array<{
			file: string;
			type?: string;
		}>;
		tracks?: string;
	};
}

/**
 * OneTouchTV decrypted response
 */
export interface OneTouchTVStream {
	stream?: string;
	file?: string;
	sources?: Array<{
		file: string;
		type: string;
	}>;
}

/**
 * KissKH video response (returns JSON directly, no decrypt needed)
 */
export interface KissKHVideoResponse {
	Video?: string;
	thirdParty?: boolean;
}

/**
 * KissKH subtitle entry
 */
export interface KissKHSubtitle {
	src: string;
	label: string;
	land?: string;
	default?: boolean;
}

/**
 * Megaup hoster decrypted response
 */
export interface MegaupStream {
	/** Direct stream URL */
	stream?: string;
	/** Alternative stream field */
	file?: string;
	/** Backup URL field */
	url?: string;
	/** Stream sources array */
	sources?: Array<{
		file: string;
		type?: string;
		quality?: string;
	}>;
	/** Subtitle tracks */
	tracks?: Array<{
		file: string;
		label: string;
		kind?: string;
	}>;
}

/**
 * Rapidshare hoster decrypted response
 */
export interface RapidshareStream {
	/** Direct stream URL */
	stream?: string;
	/** Alternative stream field */
	file?: string;
	/** Backup URL field */
	url?: string;
	/** Stream sources array */
	sources?: Array<{
		file: string;
		type?: string;
		quality?: string;
	}>;
	/** Subtitle tracks */
	tracks?: Array<{
		file: string;
		label: string;
		kind?: string;
	}>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * API error response
 */
export interface EncDecError {
	error?: string;
	message?: string;
	status?: number;
}

// Re-export EncDecApiError from unified types for backward compatibility
export { EncDecApiError } from '../types/error';
export type { EncDecOperation } from '../types/error';

// ============================================================================
// Database Search Types (Content ID Lookup)
// ============================================================================

/**
 * AnimeKai search parameters
 * Used for /db/kai/search endpoint
 */
export interface AnimeKaiSearchParams {
	/** Search query (anime title) */
	query: string;
	/** Content type filter */
	type?: 'anime' | 'movie' | 'ona' | 'ova' | 'special';
	/** Year filter */
	year?: number;
}

/**
 * AnimeKai find by ID parameters
 * Used for /db/kai/find endpoint - more reliable than search
 */
export interface AnimeKaiFindParams {
	/** MyAnimeList ID */
	mal_id?: number;
	/** AniList ID */
	anilist_id?: number;
	/** AnimeKai internal ID */
	kai_id?: string;
}

/**
 * AnimeKai database entry info (from API response)
 */
export interface AnimeKaiEntry {
	/** English title */
	title_en: string;
	/** Japanese title */
	title_jp?: string;
	/** Content type (tv, movie, ona, ova, special) */
	type?: string;
	/** Release year (as string from API) */
	year?: string;
	/** Watch URL path (e.g., "/watch/cowboy-bebop-4gnv") */
	kai_watch?: string;
	/** AnimeKai content ID (e.g., "c4O7-aI") - THIS IS WHAT WE NEED */
	kai_id: string;
	/** MyAnimeList ID (as string from API) */
	mal_id?: string;
	/** AniList ID (as string from API) */
	anilist_id?: string;
	/** Episode count (as string from API) */
	episode_count?: string;

	// Convenience getters (mapped from API response)
	/** Alias for kai_id */
	id?: string;
	/** Alias for title_en */
	title?: string;
	/** Alias for title_jp */
	altTitle?: string;
	/** Slug from kai_watch path */
	slug?: string;
}

/**
 * Single database response item with info and episodes
 */
export interface AnimeKaiDbItem {
	info: AnimeKaiEntry;
	episodes: Record<string, Record<string, { title: string; token: string }>>;
}

/**
 * AnimeKai search/find response (array of items)
 */
export type AnimeKaiSearchResponse = AnimeKaiDbItem[];

/**
 * AnimeKai find response (same format as search)
 */
export type AnimeKaiFindResponse = AnimeKaiDbItem[];

// ============================================================================
// YFlix Database Types (Content ID Lookup)
// ============================================================================

/**
 * YFlix database entry info
 */
export interface YFlixEntry {
	/** English title */
	title_en: string;
	/** Content type */
	type: 'movie' | 'tv';
	/** Release year */
	year: number;
	/** Watch URL path (e.g., "/movie/12345-title-slug") */
	flix_watch: string;
	/** YFlix content ID - THIS IS WHAT WE NEED */
	flix_id: string;
	/** TMDB ID */
	tmdb_id: number;
	/** IMDB ID */
	imdb_id: string;
	/** Total episode count (for TV shows) */
	episode_count?: number;
}

/**
 * YFlix episode info
 */
export interface YFlixEpisode {
	/** Episode title */
	title: string;
	/** Episode ID (used for fetching servers) - THIS SKIPS AN API CALL! */
	eid: string;
}

/**
 * YFlix database item with info and episodes
 */
export interface YFlixDbItem {
	info: YFlixEntry;
	/** Episodes organized by season -> episode number -> episode data */
	episodes: Record<string, Record<string, YFlixEpisode>>;
}

/**
 * YFlix find/search response (array of items)
 */
export type YFlixDbResponse = YFlixDbItem[];
