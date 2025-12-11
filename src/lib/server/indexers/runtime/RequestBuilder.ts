/**
 * Request builder for YAML indexer definitions.
 * Builds HTTP requests from definition search paths and criteria.
 */

import type {
	YamlDefinition as CardigannDefinition,
	SearchBlock,
	SearchPathBlock
} from '../schema/yamlDefinition';
import type { SearchCriteria } from '../types';
import { isMovieSearch, isTvSearch } from '../types';
import { TemplateEngine } from '../engine/TemplateEngine';
import { FilterEngine } from '../engine/FilterEngine';

/**
 * HTTP request representation.
 */
export interface HttpRequest {
	url: string;
	method: 'GET' | 'POST';
	headers: Record<string, string>;
	body?: string | URLSearchParams;
	searchPath: SearchPathBlock | null;
}

/**
 * Category mapper for converting between Newznab and tracker-specific categories.
 */
export class CategoryMapper {
	private definition: CardigannDefinition;
	private trackerToNewznab: Map<string, number[]> = new Map();
	private newznabToTracker: Map<number, string[]> = new Map();
	private defaultCategories: string[] = [];

	constructor(definition: CardigannDefinition) {
		this.definition = definition;
		this.buildMappings();
	}

	private buildMappings(): void {
		const caps = this.definition.caps;

		// Process simple categories (id -> name)
		if (caps.categories) {
			for (const [trackerId, catName] of Object.entries(caps.categories)) {
				// Look up Newznab category by name
				const newznabId = this.getNewznabIdByName(catName);
				if (newznabId) {
					this.addMapping(trackerId, newznabId);
				}
			}
		}

		// Process categorymappings (more detailed)
		if (caps.categorymappings) {
			for (const mapping of caps.categorymappings) {
				if (mapping.cat) {
					// cat is the Newznab category name or ID
					let newznabId: number;
					if (/^\d+$/.test(mapping.cat)) {
						newznabId = parseInt(mapping.cat, 10);
					} else {
						newznabId = this.getNewznabIdByName(mapping.cat) ?? parseInt(mapping.cat, 10);
					}

					if (!isNaN(newznabId)) {
						this.addMapping(mapping.id, newznabId);
					}
				}

				if (mapping.default) {
					this.defaultCategories.push(mapping.id);
				}
			}
		}
	}

	private addMapping(trackerId: string, newznabId: number): void {
		// Tracker to Newznab
		const existing = this.trackerToNewznab.get(trackerId) ?? [];
		if (!existing.includes(newznabId)) {
			existing.push(newznabId);
			this.trackerToNewznab.set(trackerId, existing);
		}

		// Newznab to Tracker
		const reverse = this.newznabToTracker.get(newznabId) ?? [];
		if (!reverse.includes(trackerId)) {
			reverse.push(trackerId);
			this.newznabToTracker.set(newznabId, reverse);
		}
	}

	private getNewznabIdByName(name: string): number | null {
		// Standard Newznab category mappings
		const mapping: Record<string, number> = {
			Console: 1000,
			Movies: 2000,
			'Movies/Foreign': 2010,
			'Movies/Other': 2020,
			'Movies/SD': 2030,
			'Movies/HD': 2040,
			'Movies/UHD': 2045,
			'Movies/BluRay': 2050,
			'Movies/3D': 2060,
			'Movies/DVD': 2070,
			'Movies/WEB-DL': 2080,
			Audio: 3000,
			'Audio/MP3': 3010,
			'Audio/Video': 3020,
			'Audio/Audiobook': 3030,
			'Audio/Lossless': 3040,
			'Audio/Other': 3050,
			'Audio/Foreign': 3060,
			PC: 4000,
			'PC/0day': 4010,
			'PC/ISO': 4020,
			'PC/Mac': 4030,
			'PC/Games': 4050,
			TV: 5000,
			'TV/WEB-DL': 5010,
			'TV/Foreign': 5020,
			'TV/SD': 5030,
			'TV/HD': 5040,
			'TV/UHD': 5045,
			'TV/Other': 5050,
			'TV/Sport': 5060,
			'TV/Anime': 5070,
			'TV/Documentary': 5080,
			XXX: 6000,
			Books: 7000,
			'Books/EBook': 7020,
			'Books/Comics': 7030,
			Other: 8000
		};

		return mapping[name] ?? null;
	}

	/**
	 * Map Newznab category IDs to tracker-specific category IDs.
	 */
	mapToTracker(newznabIds: number[]): string[] {
		const trackerIds: string[] = [];

		for (const newznabId of newznabIds) {
			const mapped = this.newznabToTracker.get(newznabId);
			if (mapped) {
				for (const trackerId of mapped) {
					if (!trackerIds.includes(trackerId)) {
						trackerIds.push(trackerId);
					}
				}
			}
		}

		return trackerIds.length > 0 ? trackerIds : this.defaultCategories;
	}

	/**
	 * Get default tracker categories.
	 */
	getDefaults(): string[] {
		return this.defaultCategories;
	}
}

export class RequestBuilder {
	private definition: CardigannDefinition;
	private templateEngine: TemplateEngine;
	private filterEngine: FilterEngine;
	private categoryMapper: CategoryMapper;
	private baseUrl: string;

	constructor(
		definition: CardigannDefinition,
		templateEngine: TemplateEngine,
		filterEngine: FilterEngine
	) {
		this.definition = definition;
		this.templateEngine = templateEngine;
		this.filterEngine = filterEngine;
		this.categoryMapper = new CategoryMapper(definition);
		this.baseUrl = definition.links[0];
	}

	/**
	 * Set the base URL (can be overridden from settings).
	 */
	setBaseUrl(url: string): void {
		this.baseUrl = url;
		this.templateEngine.setSiteLink(url);
	}

	/**
	 * Build search requests for the given criteria.
	 */
	buildSearchRequests(criteria: SearchCriteria): HttpRequest[] {
		const search = this.definition.search;
		const requests: HttpRequest[] = [];
		const seenUrls = new Set<string>();

		// Set query variables
		this.templateEngine.setQuery(criteria);

		// Map categories
		const newznabCategories = criteria.categories ?? [];
		const trackerCategories = this.categoryMapper.mapToTracker(newznabCategories);
		this.templateEngine.setCategories(trackerCategories);

		// Build keywords (combining various query parts)
		const keywords = this.buildKeywords(criteria);
		this.templateEngine.setVariable('.Query.Keywords', keywords);
		this.templateEngine.setVariable('.Keywords', this.applyKeywordsFilters(keywords, search));
		this.templateEngine.setVariable('.Categories', trackerCategories);

		// Get search paths
		const paths = this.getSearchPaths(search);

		for (const path of paths) {
			// Check if path categories match
			if (!this.pathMatchesCategories(path, trackerCategories)) {
				continue;
			}

			const request = this.buildRequestForPath(path, search, trackerCategories);
			if (request && !seenUrls.has(request.url)) {
				seenUrls.add(request.url);
				requests.push(request);
			}
		}

		return requests;
	}

	/**
	 * Build keywords string from search criteria.
	 */
	private buildKeywords(criteria: SearchCriteria): string {
		const parts: string[] = [];

		if (criteria.query) {
			parts.push(criteria.query);
		}

		// Add type-specific parts using proper type guards
		if (isMovieSearch(criteria)) {
			if (criteria.year) {
				parts.push(String(criteria.year));
			}
		} else if (isTvSearch(criteria)) {
			if (criteria.season !== undefined && criteria.episode !== undefined) {
				parts.push(
					`S${String(criteria.season).padStart(2, '0')}E${String(criteria.episode).padStart(2, '0')}`
				);
			} else if (criteria.season !== undefined) {
				parts.push(`S${String(criteria.season).padStart(2, '0')}`);
			}
		}

		return parts.join(' ');
	}

	/**
	 * Apply keywords filters from search definition.
	 */
	private applyKeywordsFilters(keywords: string, search: SearchBlock): string {
		if (!search.keywordsfilters) {
			return keywords;
		}
		return this.filterEngine.applyFilters(keywords, search.keywordsfilters);
	}

	/**
	 * Get search paths from definition.
	 */
	private getSearchPaths(search: SearchBlock): SearchPathBlock[] {
		if (search.paths && search.paths.length > 0) {
			return search.paths;
		}

		// Create path from legacy single path
		if (search.path) {
			return [
				{
					path: search.path,
					method: 'get',
					inputs: search.inputs
				}
			];
		}

		return [];
	}

	/**
	 * Check if path categories match the requested categories.
	 */
	private pathMatchesCategories(path: SearchPathBlock, trackerCategories: string[]): boolean {
		if (!path.categories || path.categories.length === 0) {
			return true; // No category restriction
		}

		if (trackerCategories.length === 0) {
			return true; // No categories requested, match all
		}

		// Check for exclusion (category list starting with "!")
		if (path.categories[0] === '!') {
			const excluded = path.categories.slice(1);
			return !trackerCategories.some((c) => excluded.includes(c));
		}

		// Check for inclusion
		return trackerCategories.some((c) => path.categories!.includes(c));
	}

	/**
	 * Build HTTP request for a single search path.
	 */
	private buildRequestForPath(
		path: SearchPathBlock,
		search: SearchBlock,
		trackerCategories: string[]
	): HttpRequest | null {
		// Update categories variable for this path
		if (path.categories && path.categories.length > 0 && path.categories[0] !== '!') {
			// Use intersection of requested and path categories
			const intersection = trackerCategories.filter((c) => path.categories!.includes(c));
			if (intersection.length > 0) {
				this.templateEngine.setCategories(intersection);
			}
		}

		// Expand path template
		const pathStr = this.templateEngine.expand(path.path || '', encodeURIComponent);

		// Build base URL
		let url = this.resolveUrl(pathStr);

		// Collect inputs
		const inputs: Record<string, string> = {};

		// Global inputs (if inheritinputs is not false)
		if (path.inheritinputs !== false && search.inputs) {
			for (const [key, value] of Object.entries(search.inputs)) {
				const expanded = this.expandInput(key, value);
				if (expanded !== null) {
					inputs[key] = expanded;
				}
			}
		}

		// Path-specific inputs
		if (path.inputs) {
			for (const [key, value] of Object.entries(path.inputs)) {
				const expanded = this.expandInput(key, value);
				if (expanded !== null) {
					inputs[key] = expanded;
				}
			}
		}

		// Determine method
		const method = (path.method?.toUpperCase() === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST';

		// Build headers
		const headers: Record<string, string> = {};
		if (search.headers) {
			for (const [key, value] of Object.entries(search.headers)) {
				const headerValue = Array.isArray(value) ? value[0] : value;
				headers[key] = this.templateEngine.expand(headerValue);
			}
		}

		// Build request
		if (method === 'GET') {
			// Add inputs as query parameters
			const params = new URLSearchParams();
			for (const [key, value] of Object.entries(inputs)) {
				if (key === '$raw') {
					// Raw query string, parse and add
					const rawParts = value.split('&');
					for (const part of rawParts) {
						const [k, v] = part.split('=');
						if (k) params.append(k, v ?? '');
					}
				} else {
					params.append(key, value);
				}
			}

			const queryString = params.toString();
			if (queryString) {
				url += (url.includes('?') ? '&' : '?') + queryString;
			}

			return { url, method, headers, searchPath: path };
		} else {
			// POST - inputs go in body
			const body = new URLSearchParams();
			for (const [key, value] of Object.entries(inputs)) {
				if (key === '$raw') {
					const rawParts = value.split('&');
					for (const part of rawParts) {
						const [k, v] = part.split('=');
						if (k) body.append(k, v ?? '');
					}
				} else {
					body.append(key, value);
				}
			}

			return { url, method, headers, body, searchPath: path };
		}
	}

	/**
	 * Expand an input value with templates.
	 */
	private expandInput(key: string, template: string): string | null {
		const expanded = this.templateEngine.expand(template);

		// Check allowEmptyInputs
		if (!expanded && !this.definition.search.allowEmptyInputs) {
			// Don't include empty inputs unless allowed
			return null;
		}

		return expanded;
	}

	/**
	 * Resolve a path to an absolute URL.
	 */
	private resolveUrl(path: string): string {
		if (path.startsWith('http://') || path.startsWith('https://')) {
			return path;
		}

		try {
			return new URL(path, this.baseUrl).toString();
		} catch {
			return this.baseUrl + (path.startsWith('/') ? path : '/' + path);
		}
	}

	/**
	 * Get the category mapper.
	 */
	getCategoryMapper(): CategoryMapper {
		return this.categoryMapper;
	}

	/**
	 * Get the current base URL.
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}
}

/**
 * Create a new RequestBuilder instance.
 */
export function createRequestBuilder(
	definition: CardigannDefinition,
	templateEngine: TemplateEngine,
	filterEngine: FilterEngine
): RequestBuilder {
	return new RequestBuilder(definition, templateEngine, filterEngine);
}
