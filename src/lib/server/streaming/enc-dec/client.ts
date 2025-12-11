/**
 * EncDec API Client
 *
 * HTTP client for the enc-dec.app encryption-as-a-service API.
 * Handles all encryption, decryption, and HTML parsing operations
 * for the various streaming providers.
 */

import { logger } from '$lib/logging';
import {
	EncDecApiError,
	type AnimeKaiEntry,
	type AnimeKaiFindResponse,
	type AnimeKaiSearchResponse,
	type DecryptPayload,
	type EncDecResponse,
	type HexaDecryptPayload,
	type KissKHDecryptPayload,
	type KissKHEncryptParams,
	type MappleSessionResult,
	type MegaupDecryptPayload,
	type MegaupStream,
	type ParseHtmlPayload,
	type RapidshareDecryptPayload,
	type RapidshareStream,
	type StringResult,
	type VideasyDecryptPayload,
	type VidstackDecryptPayload,
	type VidstackTokenResult,
	type YFlixDbItem,
	type YFlixDbResponse
} from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Configuration
// ============================================================================

const ENC_DEC_API_URL = 'https://enc-dec.app/api';
const ENC_DEC_DB_URL = 'https://enc-dec.app'; // Database endpoints don't use /api prefix
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

const DEFAULT_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
	'Content-Type': 'application/json',
	Accept: 'application/json'
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal
		});
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Retry a function with exponential backoff
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries: number = MAX_RETRIES,
	baseDelayMs: number = RETRY_DELAY_MS
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on abort errors
			if (lastError.name === 'AbortError') {
				throw lastError;
			}

			if (attempt < maxRetries - 1) {
				const delay = baseDelayMs * Math.pow(2, attempt);
				logger.debug('Retrying after error', {
					attempt: attempt + 1,
					maxRetries,
					delay,
					error: lastError.message,
					...streamLog
				});
				await sleep(delay);
			}
		}
	}

	throw lastError;
}

// ============================================================================
// EncDec Client Class
// ============================================================================

export interface EncDecClientConfig {
	baseUrl?: string;
	timeout?: number;
	retries?: number;
}

/**
 * Client for interacting with the enc-dec.app API
 */
export class EncDecClient {
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly retries: number;

	constructor(config: EncDecClientConfig = {}) {
		this.baseUrl = config.baseUrl ?? ENC_DEC_API_URL;
		this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
		this.retries = config.retries ?? MAX_RETRIES;
	}

	// --------------------------------------------------------------------------
	// Core HTTP Methods
	// --------------------------------------------------------------------------

	/**
	 * Make a GET request to the API
	 */
	private async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
		const url = new URL(`${this.baseUrl}${endpoint}`);
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				url.searchParams.set(key, value);
			}
		}

		return withRetry(async () => {
			const response = await fetchWithTimeout(
				url.toString(),
				{
					method: 'GET',
					headers: DEFAULT_HEADERS
				},
				this.timeout
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.json() as Promise<T>;
		}, this.retries);
	}

	/**
	 * Make a GET request to the database endpoints (different base URL)
	 */
	private async getDb<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
		const url = new URL(`${ENC_DEC_DB_URL}${endpoint}`);
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				url.searchParams.set(key, value);
			}
		}

		return withRetry(async () => {
			const response = await fetchWithTimeout(
				url.toString(),
				{
					method: 'GET',
					headers: DEFAULT_HEADERS
				},
				this.timeout
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.json() as Promise<T>;
		}, this.retries);
	}

	/**
	 * Make a POST request to the API
	 */
	private async post<T>(endpoint: string, body: unknown): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		return withRetry(async () => {
			const response = await fetchWithTimeout(
				url,
				{
					method: 'POST',
					headers: DEFAULT_HEADERS,
					body: JSON.stringify(body)
				},
				this.timeout
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.json() as Promise<T>;
		}, this.retries);
	}

	// --------------------------------------------------------------------------
	// Encryption Methods (GET requests)
	// --------------------------------------------------------------------------

	/**
	 * Generic encryption endpoint
	 * GET /api/enc-{provider}?text={text}
	 */
	async encrypt(provider: string, text: string): Promise<string> {
		try {
			logger.debug('Encrypting text', { provider, textLength: text.length, ...streamLog });
			const response = await this.get<StringResult>(`/enc-${provider}`, { text });
			return response.result;
		} catch (error) {
			logger.error('Encryption failed', { provider, error, ...streamLog });
			throw new EncDecApiError(
				provider,
				'encrypt',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * KissKH encryption with type parameter
	 * GET /api/enc-kisskh?text={id}&type={vid|sub}
	 */
	async encryptKissKH(params: KissKHEncryptParams): Promise<string> {
		try {
			logger.debug('Encrypting KissKH', { type: params.type, ...streamLog });
			const response = await this.get<StringResult>('/enc-kisskh', {
				text: params.text,
				type: params.type
			});
			return response.result;
		} catch (error) {
			logger.error('KissKH encryption failed', { error, ...streamLog });
			throw new EncDecApiError(
				'kisskh',
				'encrypt',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * Get Vidstack/Smashystream token
	 * GET /api/enc-vidstack
	 */
	async getVidstackToken(): Promise<{ token: string; user_id: string }> {
		try {
			logger.debug('Getting Vidstack token', streamLog);
			const response = await this.get<VidstackTokenResult>('/enc-vidstack');
			return response.result;
		} catch (error) {
			logger.error('Failed to get Vidstack token', { error, ...streamLog });
			throw new EncDecApiError(
				'vidstack',
				'token',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * Get XPrime turnstile token
	 * GET /api/enc-xprime
	 */
	async getXPrimeToken(): Promise<string> {
		try {
			logger.debug('Getting XPrime token', streamLog);
			const response = await this.get<StringResult>('/enc-xprime');
			return response.result;
		} catch (error) {
			logger.error('Failed to get XPrime token', { error, ...streamLog });
			throw new EncDecApiError(
				'xprime',
				'token',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * Get Mapple session and Next-Action hash
	 * GET /api/enc-mapple
	 * @returns Both sessionId and the dynamic nextAction hash
	 */
	async getMappleSession(): Promise<{ sessionId: string; nextAction: string }> {
		try {
			logger.debug('Getting Mapple session', streamLog);
			const response = await this.get<MappleSessionResult>('/enc-mapple');
			return {
				sessionId: response.result.sessionId,
				nextAction: response.result.nextAction
			};
		} catch (error) {
			logger.error('Failed to get Mapple session', { error, ...streamLog });
			throw new EncDecApiError(
				'mapple',
				'session',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	// --------------------------------------------------------------------------
	// Decryption Methods (POST requests)
	// --------------------------------------------------------------------------

	/**
	 * Generic decryption endpoint
	 * POST /api/dec-{provider}
	 */
	async decrypt<T = string>(provider: string, payload: DecryptPayload): Promise<T> {
		try {
			logger.debug('Decrypting', { provider, ...streamLog });
			const response = await this.post<EncDecResponse<T>>(`/dec-${provider}`, payload);
			return response.result;
		} catch (error) {
			logger.error('Decryption failed', { provider, error, ...streamLog });
			throw new EncDecApiError(
				provider,
				'decrypt',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * Videasy decryption (requires id field)
	 * POST /api/dec-videasy
	 */
	async decryptVideasy<T = string>(payload: VideasyDecryptPayload): Promise<T> {
		return this.decrypt<T>('videasy', payload);
	}

	/**
	 * Vidstack/Smashystream decryption (requires type field)
	 * POST /api/dec-vidstack
	 */
	async decryptVidstack<T = string>(payload: VidstackDecryptPayload): Promise<T> {
		return this.decrypt<T>('vidstack', payload);
	}

	/**
	 * Hexa decryption (requires key field)
	 * POST /api/dec-hexa
	 */
	async decryptHexa<T = string>(payload: HexaDecryptPayload): Promise<T> {
		return this.decrypt<T>('hexa', payload);
	}

	/**
	 * KissKH subtitle decryption (uses url field instead of text)
	 * POST /api/dec-kisskh
	 */
	async decryptKissKHSubtitle(payload: KissKHDecryptPayload): Promise<string> {
		try {
			logger.debug('Decrypting KissKH subtitle', streamLog);
			// KissKH returns raw text, not JSON
			const url = `${this.baseUrl}/dec-kisskh`;
			const response = await fetchWithTimeout(
				url,
				{
					method: 'POST',
					headers: DEFAULT_HEADERS,
					body: JSON.stringify(payload)
				},
				this.timeout
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response.text();
		} catch (error) {
			logger.error('KissKH subtitle decryption failed', { error, ...streamLog });
			throw new EncDecApiError(
				'kisskh',
				'decrypt',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	// --------------------------------------------------------------------------
	// Hoster Decryption Methods
	// --------------------------------------------------------------------------

	/**
	 * Megaup hoster decryption (requires agent field)
	 * POST /api/dec-mega
	 *
	 * @param payload - Contains encrypted text and User-Agent
	 * @returns Decrypted stream data
	 */
	async decryptMegaup(payload: MegaupDecryptPayload): Promise<MegaupStream> {
		try {
			logger.debug('Decrypting Megaup stream', streamLog);
			const response = await this.post<EncDecResponse<MegaupStream>>('/dec-mega', payload);
			return response.result;
		} catch (error) {
			logger.error('Megaup decryption failed', { error, ...streamLog });
			throw new EncDecApiError(
				'mega',
				'decrypt',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * Rapidshare hoster decryption (requires agent field)
	 * POST /api/dec-rapid
	 *
	 * @param payload - Contains encrypted text and User-Agent
	 * @returns Decrypted stream data
	 */
	async decryptRapidshare(payload: RapidshareDecryptPayload): Promise<RapidshareStream> {
		try {
			logger.debug('Decrypting Rapidshare stream', streamLog);
			const response = await this.post<EncDecResponse<RapidshareStream>>('/dec-rapid', payload);
			return response.result;
		} catch (error) {
			logger.error('Rapidshare decryption failed', { error, ...streamLog });
			throw new EncDecApiError(
				'rapid',
				'decrypt',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	// --------------------------------------------------------------------------
	// HTML Parsing
	// --------------------------------------------------------------------------

	/**
	 * Parse encrypted HTML into structured JSON
	 * POST /api/parse-html
	 */
	async parseHtml<T = Record<string, Record<string, Record<string, string>>>>(
		html: string
	): Promise<T> {
		try {
			logger.debug('Parsing HTML', { htmlLength: html.length, ...streamLog });
			const payload: ParseHtmlPayload = { text: html };
			const response = await this.post<EncDecResponse<T>>('/parse-html', payload);
			return response.result;
		} catch (error) {
			logger.error('HTML parsing failed', { error, ...streamLog });
			throw new EncDecApiError(
				'html',
				'parse',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	// --------------------------------------------------------------------------
	// Database Search Methods (Content ID Lookup)
	// --------------------------------------------------------------------------

	/**
	 * Find AnimeKai entry by external ID (most reliable)
	 * GET /db/kai/find?mal_id={id} or ?anilist_id={id} or ?kai_id={id}
	 *
	 * This is preferred over search when external IDs are available.
	 */
	async findAnimeKaiById(options: {
		mal_id?: number;
		anilist_id?: number;
		kai_id?: string;
	}): Promise<AnimeKaiEntry | null> {
		try {
			logger.debug('Finding AnimeKai by ID', { ...options, ...streamLog });

			const params: Record<string, string> = {};
			if (options.mal_id) params.mal_id = options.mal_id.toString();
			else if (options.anilist_id) params.anilist_id = options.anilist_id.toString();
			else if (options.kai_id) params.kai_id = options.kai_id;
			else {
				throw new Error('At least one ID parameter is required');
			}

			const response = await this.getDb<AnimeKaiFindResponse>('/db/kai/find', params);
			return response[0]?.info ?? null;
		} catch (error) {
			// Don't throw on not found - just return null
			if (error instanceof Error && error.message.includes('404')) {
				return null;
			}
			logger.error('AnimeKai find failed', { ...options, error, ...streamLog });
			throw new EncDecApiError(
				'animekai',
				'search',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	/**
	 * Search AnimeKai database for content ID by title
	 * GET /db/kai/search?query={query}&type={type}&year={year}
	 *
	 * Use findAnimeKaiById when external IDs are available - it's more reliable.
	 */
	async searchAnimeKai(
		query: string,
		options?: { type?: 'anime' | 'movie' | 'ona' | 'ova' | 'special'; year?: number }
	): Promise<AnimeKaiEntry[]> {
		try {
			logger.debug('Searching AnimeKai database', { query, ...options, ...streamLog });

			const params: Record<string, string> = { query };
			if (options?.type) params.type = options.type;
			if (options?.year) params.year = options.year.toString();

			const response = await this.getDb<AnimeKaiSearchResponse>('/db/kai/search', params);
			// Map the response array to AnimeKaiEntry format
			return response.map((item) => item.info) ?? [];
		} catch (error) {
			logger.error('AnimeKai search failed', { query, error, ...streamLog });
			throw new EncDecApiError(
				'animekai',
				'search',
				undefined,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	// --------------------------------------------------------------------------
	// YFlix Database Methods (Content ID Lookup)
	// --------------------------------------------------------------------------

	/**
	 * Find YFlix entry by external ID
	 * GET /db/flix/find?tmdb_id={id} or ?imdb_id={id} or ?flix_id={id}
	 *
	 * Returns the full item including episode IDs, which can skip an API call!
	 */
	async findYFlixById(options: {
		tmdb_id?: string | number;
		imdb_id?: string;
		flix_id?: string;
		type?: 'movie' | 'tv';
	}): Promise<YFlixDbItem | null> {
		try {
			logger.debug('Finding YFlix by ID', { ...options, ...streamLog });

			const params: Record<string, string> = {};
			if (options.tmdb_id) params.tmdb_id = options.tmdb_id.toString();
			else if (options.imdb_id) params.imdb_id = options.imdb_id;
			else if (options.flix_id) params.flix_id = options.flix_id;
			else {
				throw new Error('At least one ID parameter is required');
			}

			if (options.type) params.type = options.type;

			const response = await this.getDb<YFlixDbResponse>('/db/flix/find', params);
			return response[0] ?? null;
		} catch (error) {
			// Don't throw on not found - just return null
			if (error instanceof Error && error.message.includes('404')) {
				return null;
			}
			logger.debug('YFlix find failed (may not exist in DB)', { ...options, ...streamLog });
			return null;
		}
	}

	/**
	 * Search YFlix database for content by title
	 * GET /db/flix/search?query={query}&type={type}&year={year}
	 *
	 * Use findYFlixById when TMDB/IMDB IDs are available - it's more reliable.
	 */
	async searchYFlix(
		query: string,
		options?: { type?: 'movie' | 'tv'; year?: number }
	): Promise<YFlixDbItem[]> {
		try {
			logger.debug('Searching YFlix database', { query, ...options, ...streamLog });

			const params: Record<string, string> = { query };
			if (options?.type) params.type = options.type;
			if (options?.year) params.year = options.year.toString();

			const response = await this.getDb<YFlixDbResponse>('/db/flix/search', params);
			return response ?? [];
		} catch (error) {
			logger.debug('YFlix search failed', { query, error, ...streamLog });
			return [];
		}
	}

	// --------------------------------------------------------------------------
	// Health & Utility Methods
	// --------------------------------------------------------------------------

	/**
	 * Get the base URL for the API
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}

	/**
	 * Check if the EncDec API is healthy and reachable
	 * Performs a lightweight health check
	 */
	async isHealthy(): Promise<boolean> {
		try {
			// Try a simple endpoint to check connectivity
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(`${this.baseUrl}/health`, {
				method: 'GET',
				headers: DEFAULT_HEADERS,
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			return response.ok || response.status === 404; // 404 means API is reachable but no health endpoint
		} catch {
			return false;
		}
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let clientInstance: EncDecClient | null = null;

/**
 * Get the singleton EncDecClient instance
 */
export function getEncDecClient(): EncDecClient {
	if (!clientInstance) {
		clientInstance = new EncDecClient();
	}
	return clientInstance;
}

/**
 * Create a new EncDecClient with custom configuration
 */
export function createEncDecClient(config: EncDecClientConfig): EncDecClient {
	return new EncDecClient(config);
}
