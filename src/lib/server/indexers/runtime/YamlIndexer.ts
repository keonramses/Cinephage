/**
 * YamlIndexer - Complete indexer implementation using YAML definitions.
 *
 * This class ties together all indexer components:
 * - TemplateEngine (Go-style templates)
 * - FilterEngine (data transformation filters)
 * - SelectorEngine (CSS/JSONPath selection)
 * - RequestBuilder (HTTP request construction)
 * - ResponseParser (HTML/JSON/XML parsing)
 * - AuthManager (login flows and cookie management)
 * - DownloadHandler (download URL resolution)
 */

import type {
	IIndexer,
	IndexerConfig,
	IndexerCapabilities,
	SearchMode,
	SearchParam,
	SearchCriteria,
	ReleaseResult,
	IndexerProtocol,
	IndexerAccessType,
	IndexerDownloadResult
} from '../types';
import type {
	YamlDefinition,
	YamlDefinition as CardigannDefinition
} from '../schema/yamlDefinition';
import { TemplateEngine, createTemplateEngine } from '../engine/TemplateEngine';
import { FilterEngine, createFilterEngine } from '../engine/FilterEngine';
import { SelectorEngine, createSelectorEngine } from '../engine/SelectorEngine';
import { RequestBuilder, createRequestBuilder } from './RequestBuilder';
import { ResponseParser, createResponseParser } from './ResponseParser';
import { AuthManager, createAuthManager } from '../auth/AuthManager';
import { CookieStore, createCookieStore } from '../auth/CookieStore';
import { DownloadHandler, createDownloadHandler } from './DownloadHandler';
import { SearchCapabilityChecker } from './SearchCapabilityChecker';
import { getPersistentStatusTracker } from '../status';
import { getRateLimitRegistry } from '../ratelimit';
import type { RateLimitConfig } from '../ratelimit/types';
import { createChildLogger } from '$lib/logging';
import { IndexerHttp, createIndexerHttp } from '../http/IndexerHttp';

export interface YamlIndexerConfig {
	/** Indexer config from database */
	config: IndexerConfig;
	/** YAML definition (parsed YAML) */
	definition: YamlDefinition;
	/** Optional rate limit config */
	rateLimit?: RateLimitConfig;
}

/**
 * Full-featured indexer implementation using YAML definitions.
 */
export class YamlIndexer implements IIndexer {
	readonly id: string;
	readonly name: string;
	readonly definitionId: string;
	readonly protocol: IndexerProtocol;
	readonly accessType: IndexerAccessType;
	readonly capabilities: IndexerCapabilities;
	readonly baseUrl: string;

	// Search capability toggles (from config)
	readonly enableAutomaticSearch: boolean;
	readonly enableInteractiveSearch: boolean;

	private readonly config: IndexerConfig;
	private readonly definition: YamlDefinition;
	private readonly templateEngine: TemplateEngine;
	private readonly filterEngine: FilterEngine;
	private readonly selectorEngine: SelectorEngine;
	private readonly requestBuilder: RequestBuilder;
	private readonly responseParser: ResponseParser;
	private readonly authManager: AuthManager;
	private readonly downloadHandler: DownloadHandler;
	private readonly cookieStore: CookieStore;
	private readonly capabilityChecker: SearchCapabilityChecker;
	private readonly log: ReturnType<typeof createChildLogger>;
	private readonly http: IndexerHttp;

	private cookies: Record<string, string> = {};
	private isLoggedIn = false;

	constructor(indexerConfig: YamlIndexerConfig) {
		const { config, definition, rateLimit } = indexerConfig;

		this.config = config;
		this.definition = definition;
		this.id = config.id;
		this.name = config.name;
		this.definitionId = config.definitionId;

		// Search capability toggles
		this.enableAutomaticSearch = config.enableAutomaticSearch;
		this.enableInteractiveSearch = config.enableInteractiveSearch;

		// Determine protocol and access type
		this.protocol = 'torrent'; // YAML definitions are torrent-only currently
		this.accessType = this.mapAccessType(definition.type);

		// Build capabilities from definition
		this.capabilities = this.buildCapabilities(definition);

		// Create engines
		this.filterEngine = createFilterEngine();
		this.templateEngine = createTemplateEngine();
		this.selectorEngine = createSelectorEngine(this.templateEngine, this.filterEngine);

		// Create runtime components
		this.requestBuilder = createRequestBuilder(definition, this.templateEngine, this.filterEngine);
		this.responseParser = createResponseParser(
			definition,
			this.templateEngine,
			this.filterEngine,
			this.selectorEngine
		);

		// Create auth components
		this.cookieStore = createCookieStore();
		this.authManager = createAuthManager(
			definition,
			this.templateEngine,
			this.filterEngine,
			this.selectorEngine,
			this.cookieStore
		);

		// Create download handler
		this.downloadHandler = createDownloadHandler(
			definition,
			this.templateEngine,
			this.filterEngine,
			this.selectorEngine
		);

		// Create capability checker
		this.capabilityChecker = new SearchCapabilityChecker();

		// Configure with base URL and settings
		this.baseUrl = config.baseUrl || definition.links[0];
		this.requestBuilder.setBaseUrl(this.baseUrl);
		this.templateEngine.setSiteLink(this.baseUrl);
		this.templateEngine.setConfig(config.settings ?? {});

		this.log = createChildLogger({ indexer: this.name, indexerId: this.id });

		// Create unified HTTP client (handles retry, rate limiting, Cloudflare)
		this.http = createIndexerHttp({
			indexerId: this.id,
			indexerName: this.name,
			baseUrl: this.baseUrl,
			alternateUrls: definition.links.slice(1),
			userAgent: 'Cinephage/1.0',
			rateLimit: rateLimit ?? { requests: 30, periodMs: 60_000 }
		});

		// Initialize tracking
		this.initializeTracking(config.enabled, config.priority, rateLimit);
	}

	/**
	 * Map definition type to IndexerAccessType.
	 */
	private mapAccessType(type: string): IndexerAccessType {
		switch (type) {
			case 'private':
				return 'private';
			case 'semi-private':
				return 'semi-private';
			default:
				return 'public';
		}
	}

	/**
	 * Build capabilities from YAML definition.
	 */
	private buildCapabilities(definition: CardigannDefinition): IndexerCapabilities {
		const caps = definition.caps;
		const modes = caps.modes ?? {};

		// Helper to convert YAML params to SearchParam[]
		const toSearchParams = (params: string[] | undefined): SearchParam[] => {
			if (!params) return ['q'];
			return params.map((p) => {
				// Map YAML param names to our SearchParam type
				const mapping: Record<string, SearchParam> = {
					q: 'q',
					imdbid: 'imdbId',
					tmdbid: 'tmdbId',
					tvdbid: 'tvdbId',
					tvmazeid: 'tvMazeId',
					traktid: 'traktId',
					season: 'season',
					ep: 'ep',
					year: 'year',
					genre: 'genre',
					artist: 'artist',
					album: 'album',
					author: 'author',
					title: 'title'
				};
				return mapping[p.toLowerCase()] ?? 'q';
			});
		};

		// Build search modes
		const buildSearchMode = (params: string[] | undefined): SearchMode => ({
			available: params !== undefined && params.length > 0,
			supportedParams: toSearchParams(params)
		});

		// Build category map
		const categories = new Map<number, string>();
		if (caps.categories) {
			for (const [catId, catName] of Object.entries(caps.categories)) {
				const numId = parseInt(catId, 10);
				if (!isNaN(numId)) {
					categories.set(numId, catName);
				}
			}
		}
		if (caps.categorymappings) {
			for (const mapping of caps.categorymappings) {
				if (mapping.cat) {
					const numId = parseInt(mapping.cat, 10);
					if (!isNaN(numId)) {
						categories.set(numId, mapping.desc ?? mapping.cat);
					}
				}
			}
		}

		return {
			search: modes['search']
				? buildSearchMode(modes['search'])
				: { available: true, supportedParams: ['q'] },
			movieSearch: modes['movie-search'] ? buildSearchMode(modes['movie-search']) : undefined,
			tvSearch: modes['tv-search'] ? buildSearchMode(modes['tv-search']) : undefined,
			musicSearch: modes['music-search'] ? buildSearchMode(modes['music-search']) : undefined,
			bookSearch: modes['book-search'] ? buildSearchMode(modes['book-search']) : undefined,
			categories,
			supportsPagination: false,
			supportsInfoHash: true,
			limitMax: 100,
			limitDefault: 100
		};
	}

	/**
	 * Initialize status tracking and rate limiting.
	 */
	private initializeTracking(
		enabled: boolean,
		priority: number,
		rateLimit?: RateLimitConfig
	): void {
		const statusTracker = getPersistentStatusTracker();
		statusTracker.initialize(this.id, enabled, priority);

		if (rateLimit) {
			const registry = getRateLimitRegistry();
			registry.register(this.id, rateLimit);
		} else if (this.definition.requestdelay) {
			// Use definition's request delay
			const registry = getRateLimitRegistry();
			registry.register(this.id, {
				requests: 1,
				periodMs: this.definition.requestdelay * 1000
			});
		}
	}

	/**
	 * Check if this indexer can handle the given search criteria.
	 * Uses SearchCapabilityChecker for proper Prowlarr-style filtering
	 * that considers both search modes AND category compatibility.
	 */
	canSearch(criteria: SearchCriteria): boolean {
		return this.capabilityChecker.canSearch(criteria, this.capabilities);
	}

	/**
	 * Perform a search.
	 */
	async search(criteria: SearchCriteria): Promise<ReleaseResult[]> {
		const startTime = Date.now();

		try {
			// Check rate limit
			await this.checkRateLimit();

			// Ensure we're logged in
			await this.ensureLoggedIn();

			// Build requests
			const requests = this.requestBuilder.buildSearchRequests(criteria);
			if (requests.length === 0) {
				this.log.warn('No search requests generated', { criteria });
				return [];
			}

			this.log.debug('Built search requests', { count: requests.length });

			// Execute requests and collect results
			const allResults: ReleaseResult[] = [];

			for (const request of requests) {
				this.log.debug('Executing search request', { url: request.url, method: request.method });
				try {
					const results = await this.executeSearchRequest(request);
					allResults.push(...results);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.log.warn('Search request failed', { url: request.url, error: message });
					// Continue with other requests
				}
			}

			// Record success
			const duration = Date.now() - startTime;
			this.recordSuccess(duration);

			this.log.debug('Search completed', { resultCount: allResults.length, durationMs: duration });

			return allResults;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Search failed', { error: message, criteria });
			this.recordFailure(message);
			throw error;
		}
	}

	/**
	 * Execute a single search request using the unified HTTP client.
	 * Cloudflare solving, retry, and rate limiting are handled automatically.
	 */
	private async executeSearchRequest(request: {
		url: string;
		method: 'GET' | 'POST';
		headers: Record<string, string>;
		body?: string | URLSearchParams;
		searchPath: unknown;
	}): Promise<ReleaseResult[]> {
		// Sync cookies to HTTP client
		this.http.setCookies(this.cookies);

		// Execute request via unified HTTP client
		// This handles: retry, rate limiting, Cloudflare solving automatically
		const response =
			request.method === 'POST'
				? await this.http.post(request.url, request.body!, {
						headers: request.headers,
						followRedirects: this.definition.followredirect ?? true
					})
				: await this.http.get(request.url, {
						headers: request.headers,
						followRedirects: this.definition.followredirect ?? true
					});

		// Store any new cookies from the response
		this.http.parseAndStoreCookies(response.headers);

		// Check if login is needed
		// Create a mock Response object for the auth manager
		const mockResponse = new Response(response.body, {
			status: response.status,
			headers: response.headers
		});

		if (this.authManager.checkLoginNeeded(mockResponse, response.body)) {
			this.log.info('Login needed, re-authenticating');
			this.isLoggedIn = false;
			await this.ensureLoggedIn();

			// Sync new cookies and retry
			this.http.setCookies(this.cookies);

			const retryResponse =
				request.method === 'POST'
					? await this.http.post(request.url, request.body!, {
							headers: request.headers,
							followRedirects: this.definition.followredirect ?? true
						})
					: await this.http.get(request.url, {
							headers: request.headers,
							followRedirects: this.definition.followredirect ?? true
						});

			return this.parseResponse(retryResponse.body, request.searchPath);
		}

		return this.parseResponse(response.body, request.searchPath);
	}

	/**
	 * Parse a response into release results.
	 */
	private parseResponse(content: string, searchPath: unknown): ReleaseResult[] {
		const parseResult = this.responseParser.parse(
			content,
			searchPath as Parameters<typeof this.responseParser.parse>[1],
			{
				indexerId: this.id,
				indexerName: this.name,
				baseUrl: this.requestBuilder.getBaseUrl(),
				protocol: this.protocol
			}
		);

		if (parseResult.errors && parseResult.errors.length > 0) {
			this.log.warn('Parse had errors', { errors: parseResult.errors });
		}

		return parseResult.releases;
	}

	/**
	 * Ensure we're logged in (if required).
	 */
	private async ensureLoggedIn(): Promise<void> {
		if (!this.authManager.requiresAuth()) {
			return;
		}

		if (this.isLoggedIn && Object.keys(this.cookies).length > 0) {
			return;
		}

		const context = {
			indexerId: this.id,
			baseUrl: this.requestBuilder.getBaseUrl(),
			settings: this.config.settings ?? {}
		};

		// Try loading stored cookies first
		const hasStoredCookies = await this.authManager.loadCookies(context);
		if (hasStoredCookies) {
			this.cookies = this.authManager.getCookies();
			this.isLoggedIn = true;
			this.log.debug('Loaded stored cookies');
			return;
		}

		// Perform login
		this.log.info('Performing login');
		const loginResult = await this.authManager.login(context);

		if (!loginResult.success) {
			throw new Error(`Login failed: ${loginResult.error}`);
		}

		this.cookies = loginResult.cookies;
		this.isLoggedIn = true;

		// Save cookies for next time
		await this.authManager.saveCookies(context);
		this.log.debug('Login successful, cookies saved');
	}

	/**
	 * Test connectivity to the indexer.
	 */
	async test(): Promise<void> {
		this.log.debug('Testing indexer connectivity');

		try {
			// Ensure we can log in
			await this.ensureLoggedIn();

			// Try a basic search
			const results = await this.search({
				searchType: 'basic',
				query: 'test',
				limit: 1
			});

			this.log.info('Indexer test successful', { resultCount: results.length });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Indexer test failed', { error: message });
			throw new Error(`Indexer test failed: ${message}`);
		}
	}

	/**
	 * Get download URL for a release (resolve if needed).
	 */
	async getDownloadUrl(release: ReleaseResult): Promise<string> {
		// Prefer magnet URL if available and configured
		if (this.config.preferMagnetUrl && release.magnetUrl) {
			return release.magnetUrl;
		}

		const downloadUrl = release.downloadUrl ?? release.magnetUrl;
		if (!downloadUrl) {
			throw new Error('No download URL available');
		}

		// If it's already a magnet link, return as-is
		if (downloadUrl.startsWith('magnet:')) {
			return downloadUrl;
		}

		// Check if we need to resolve the download URL
		if (!this.downloadHandler.needsResolution()) {
			return downloadUrl;
		}

		// Resolve download URL
		const context = {
			baseUrl: this.requestBuilder.getBaseUrl(),
			cookies: this.cookies,
			settings: this.config.settings ?? {}
		};

		const result = await this.downloadHandler.resolveDownload(downloadUrl, context);

		if (!result.success) {
			this.log.warn('Download resolution failed', { error: result.error });
			return downloadUrl; // Fall back to original URL
		}

		return result.magnetUrl ?? result.request?.url ?? downloadUrl;
	}

	/**
	 * Download a torrent file from the indexer.
	 * Handles authentication, cookies, and redirect following (including magnet: redirects).
	 *
	 * @param url - The download URL (torrent file URL, not magnet)
	 * @returns Download result with file data or magnet redirect
	 */
	async downloadTorrent(url: string): Promise<IndexerDownloadResult> {
		const startTime = Date.now();

		this.log.debug('Downloading torrent', { url: url.substring(0, 100) });

		try {
			// Ensure we're logged in
			await this.ensureLoggedIn();

			// Check rate limit
			await this.checkRateLimit();

			// If URL is already a magnet, return it directly
			if (url.startsWith('magnet:')) {
				const { extractInfoHashFromMagnet } =
					await import('$lib/server/downloadClients/utils/torrentParser');
				const infoHash = extractInfoHashFromMagnet(url);
				return {
					success: true,
					magnetUrl: url,
					infoHash,
					responseTimeMs: Date.now() - startTime
				};
			}

			// Build headers with cookies and authentication
			const headers: Record<string, string> = {
				Accept: 'application/x-bittorrent, */*',
				Referer: this.requestBuilder.getBaseUrl()
			};

			// Add cookies
			if (Object.keys(this.cookies).length > 0) {
				headers['Cookie'] = CookieStore.buildCookieHeader(this.cookies);
			}

			// Add definition headers if any
			const defHeaders = this.definition.download?.headers ?? this.definition.search?.headers;
			if (defHeaders) {
				for (const [key, values] of Object.entries(defHeaders)) {
					headers[key] = this.templateEngine.expand(values[0]);
				}
			}

			// Fetch with redirect handling
			const maxRedirects = 5;
			let currentUrl = url;
			let response: Response | null = null;

			for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount++) {
				this.log.debug('Fetching torrent URL', {
					url: currentUrl.substring(0, 100),
					redirectCount
				});

				response = await fetch(currentUrl, {
					method: 'GET',
					headers,
					redirect: 'manual'
				});

				// Check for redirects
				if (
					response.status === 301 ||
					response.status === 302 ||
					response.status === 303 ||
					response.status === 307 ||
					response.status === 308
				) {
					const location = response.headers.get('location');
					if (!location) {
						return {
							success: false,
							error: 'Redirect without location header',
							responseTimeMs: Date.now() - startTime
						};
					}

					// If redirect is to magnet URL, return it
					if (location.startsWith('magnet:')) {
						const { extractInfoHashFromMagnet } =
							await import('$lib/server/downloadClients/utils/torrentParser');
						const infoHash = extractInfoHashFromMagnet(location);
						this.log.debug('Redirect to magnet URL', { infoHash });
						return {
							success: true,
							magnetUrl: location,
							infoHash,
							responseTimeMs: Date.now() - startTime
						};
					}

					// Resolve relative URL
					currentUrl = new URL(location, currentUrl).toString();
					continue;
				}

				// Not a redirect, break out of loop
				break;
			}

			if (!response) {
				return {
					success: false,
					error: 'No response received',
					responseTimeMs: Date.now() - startTime
				};
			}

			// Check for HTTP errors
			if (!response.ok) {
				const errorText = await response.text().catch(() => '');
				this.log.error('Torrent download failed', {
					status: response.status,
					statusText: response.statusText,
					error: errorText.substring(0, 200)
				});
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`,
					responseTimeMs: Date.now() - startTime
				};
			}

			// Read response body
			const arrayBuffer = await response.arrayBuffer();
			const data = Buffer.from(arrayBuffer);

			// Parse the data to check if it's a torrent or magnet redirect
			const { parseTorrentFile } = await import('$lib/server/downloadClients/utils/torrentParser');
			const parseResult = parseTorrentFile(data);

			if (!parseResult.success) {
				this.log.error('Failed to parse torrent file', { error: parseResult.error });
				return {
					success: false,
					error: parseResult.error,
					responseTimeMs: Date.now() - startTime
				};
			}

			// If it was a magnet redirect encoded as bytes
			if (parseResult.magnetUrl) {
				return {
					success: true,
					magnetUrl: parseResult.magnetUrl,
					infoHash: parseResult.infoHash,
					responseTimeMs: Date.now() - startTime
				};
			}

			// It's a valid torrent file
			this.log.debug('Torrent file downloaded', {
				size: data.length,
				infoHash: parseResult.infoHash
			});

			this.recordSuccess(Date.now() - startTime);

			return {
				success: true,
				data,
				infoHash: parseResult.infoHash,
				responseTimeMs: Date.now() - startTime
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error('Torrent download failed', { error: message });
			this.recordFailure(message);
			return {
				success: false,
				error: message,
				responseTimeMs: Date.now() - startTime
			};
		}
	}

	/**
	 * Get current cookies (for external use).
	 */
	getCookies(): Record<string, string> {
		return { ...this.cookies };
	}

	/**
	 * Clear authentication (force re-login).
	 */
	async clearAuth(): Promise<void> {
		this.isLoggedIn = false;
		this.cookies = {};
		await this.authManager.clearCookies({
			indexerId: this.id,
			baseUrl: this.requestBuilder.getBaseUrl(),
			settings: this.config.settings ?? {}
		});
	}

	/**
	 * Check rate limit before making request.
	 */
	private async checkRateLimit(): Promise<void> {
		const registry = getRateLimitRegistry();
		const limiter = registry.get(this.id);

		if (!limiter.canProceed()) {
			const waitTime = limiter.getWaitTime();
			this.log.debug('Rate limited, waiting', { waitTimeMs: waitTime });
			await this.delay(waitTime);
		}

		limiter.recordRequest();
	}

	/**
	 * Record a successful operation.
	 */
	private recordSuccess(responseTimeMs?: number): void {
		const statusTracker = getPersistentStatusTracker();
		statusTracker.recordSuccess(this.id, responseTimeMs);
	}

	/**
	 * Record a failed operation.
	 */
	private recordFailure(message: string): void {
		const statusTracker = getPersistentStatusTracker();
		statusTracker.recordFailure(this.id, message);
	}

	/**
	 * Utility: delay for given milliseconds.
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create a new YamlIndexer instance.
 */
export function createYamlIndexer(config: YamlIndexerConfig): YamlIndexer {
	return new YamlIndexer(config);
}
