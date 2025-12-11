/**
 * Response parser for YAML indexer definitions.
 * Parses HTML, JSON, and XML responses into ReleaseResult objects.
 */

import type { CheerioAPI, Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import type {
	YamlDefinition as CardigannDefinition,
	FieldDefinition,
	SearchPathBlock
} from '../schema/yamlDefinition';
import type { ReleaseResult, Category, IndexerProtocol } from '../types';
import { parseSize } from '../types';
import { TemplateEngine } from '../engine/TemplateEngine';
import { FilterEngine } from '../engine/FilterEngine';
import { SelectorEngine, type JsonValue } from '../engine/SelectorEngine';
import { logger } from '$lib/logging';

export interface ParseResult {
	releases: ReleaseResult[];
	errors: string[];
}

export interface ParseContext {
	indexerId: string;
	indexerName: string;
	protocol: IndexerProtocol;
	baseUrl: string;
}

export class ResponseParser {
	private definition: CardigannDefinition;
	private templateEngine: TemplateEngine;
	private filterEngine: FilterEngine;
	private selectorEngine: SelectorEngine;

	constructor(
		definition: CardigannDefinition,
		templateEngine: TemplateEngine,
		filterEngine: FilterEngine,
		selectorEngine: SelectorEngine
	) {
		this.definition = definition;
		this.templateEngine = templateEngine;
		this.filterEngine = filterEngine;
		this.selectorEngine = selectorEngine;
	}

	/**
	 * Parse response content into release results.
	 */
	parse(
		content: string,
		searchPath: SearchPathBlock | undefined,
		context: ParseContext
	): ParseResult {
		const errors: string[] = [];
		const releases: ReleaseResult[] = [];

		// Determine response type
		const responseType = this.getResponseType(searchPath, content);

		try {
			if (responseType === 'json') {
				const parsed = this.selectorEngine.parseJson(content);
				const results = this.parseJsonResponse(parsed, context);
				releases.push(...results);
			} else if (responseType === 'xml') {
				const $ = this.selectorEngine.parseXml(content);
				const results = this.parseHtmlResponse($, context);
				releases.push(...results);
			} else {
				const $ = this.selectorEngine.parseHtml(content);
				const results = this.parseHtmlResponse($, context);
				releases.push(...results);
			}
		} catch (error) {
			errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
		}

		return { releases, errors };
	}

	/**
	 * Determine response type from path config or content.
	 */
	private getResponseType(
		searchPath: SearchPathBlock | undefined,
		content: string
	): 'json' | 'html' | 'xml' {
		// Check path-specific response type
		if (searchPath?.response?.type) {
			return searchPath.response.type;
		}

		// Auto-detect from content
		return this.selectorEngine.detectResponseType(content);
	}

	/**
	 * Parse JSON response.
	 */
	private parseJsonResponse(json: JsonValue, context: ParseContext): ReleaseResult[] {
		const search = this.definition.search;
		const releases: ReleaseResult[] = [];

		if (!search.rows?.selector) {
			// No row selector, treat entire response as array
			if (Array.isArray(json)) {
				for (const item of json) {
					const release = this.extractReleaseFromJson(item, null, context);
					if (release) releases.push(release);
				}
			}
			return releases;
		}

		// Select rows using selector
		const rowSelector = search.rows.selector;
		const rows = this.selectorEngine.selectJsonAll(json, rowSelector);

		// Skip rows if 'after' is specified
		const skipCount = search.rows.after ?? 0;
		const filteredRows = rows.slice(skipCount);

		// Check for 'multiple' directive - used when each row has a nested array
		// (e.g., YTS where each movie has multiple torrents)
		// 'multiple' can be a string selector (e.g., "torrents") or true (deprecated)
		const multipleSelector = typeof search.rows.multiple === 'string' ? search.rows.multiple : null;

		for (const row of filteredRows) {
			try {
				if (multipleSelector && typeof row === 'object' && row !== null) {
					// Extract nested array and create release for each item
					const nestedItems = this.selectorEngine.selectJsonAll(row, multipleSelector);
					for (const nestedItem of nestedItems) {
						// Pass parent row for accessing parent fields (title, imdb_code, etc.)
						const release = this.extractReleaseFromJson(nestedItem, row, context);
						if (release) releases.push(release);
					}
				} else {
					const release = this.extractReleaseFromJson(row, null, context);
					if (release) releases.push(release);
				}
			} catch (error) {
				logger.warn('Failed to parse JSON row', {
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return releases;
	}

	/**
	 * Extract release from JSON row.
	 * @param row The current JSON row (or nested item when using 'multiple')
	 * @param parentRow The parent row when using 'multiple' directive (for accessing parent fields)
	 * @param context Parse context
	 */
	private extractReleaseFromJson(
		row: JsonValue,
		parentRow: JsonValue | null,
		context: ParseContext
	): ReleaseResult | null {
		const search = this.definition.search;
		const fields = search.fields;

		if (!fields) return null;

		// Set .Result variables for template expansion
		// This allows fields to use {{ .Result.fieldname }} in their text templates
		this.setResultVariables(row, parentRow);

		const values: Record<string, string | null> = {};

		// Extract all field values
		for (const [fieldName, fieldDef] of Object.entries(fields)) {
			try {
				// First try to extract from current row
				const result = this.selectorEngine.selectJson(row, fieldDef, false);
				if (result.value !== null) {
					values[fieldName.toLowerCase()] = result.value;
				} else if (parentRow) {
					// Fall back to parent row if not found in current row
					const parentResult = this.selectorEngine.selectJson(parentRow, fieldDef, false);
					values[fieldName.toLowerCase()] = parentResult.value;
				} else {
					values[fieldName.toLowerCase()] = null;
				}
			} catch (error) {
				// Try parent row on error if available
				if (parentRow) {
					try {
						const parentResult = this.selectorEngine.selectJson(parentRow, fieldDef, false);
						values[fieldName.toLowerCase()] = parentResult.value;
						continue;
					} catch {
						// Ignore parent error
					}
				}
				// Only log at debug level to reduce noise
				if (!this.isOptionalField(fieldName, fieldDef)) {
					logger.debug(`Field ${fieldName} extraction failed`, {
						error: error instanceof Error ? error.message : String(error)
					});
				}
				values[fieldName.toLowerCase()] = null;
			}
		}

		return this.buildReleaseResult(values, context);
	}

	/**
	 * Set .Result variables in template engine from row data.
	 * When using 'multiple' directive, merges parent row data first, then overlays child row data.
	 */
	private setResultVariables(row: JsonValue, parentRow: JsonValue | null): void {
		// First set parent row fields (if present)
		if (parentRow && typeof parentRow === 'object' && !Array.isArray(parentRow)) {
			for (const [key, value] of Object.entries(parentRow as Record<string, JsonValue>)) {
				if (
					value !== null &&
					value !== undefined &&
					!Array.isArray(value) &&
					typeof value !== 'object'
				) {
					this.templateEngine.setVariable(`.Result.${key}`, String(value));
				}
			}
		}

		// Then overlay current row fields (takes precedence)
		if (row && typeof row === 'object' && !Array.isArray(row)) {
			for (const [key, value] of Object.entries(row as Record<string, JsonValue>)) {
				if (
					value !== null &&
					value !== undefined &&
					!Array.isArray(value) &&
					typeof value !== 'object'
				) {
					this.templateEngine.setVariable(`.Result.${key}`, String(value));
				}
			}
		}
	}

	/**
	 * Parse HTML/XML response.
	 */
	private parseHtmlResponse($: CheerioAPI, context: ParseContext): ReleaseResult[] {
		const search = this.definition.search;
		const releases: ReleaseResult[] = [];

		if (!search.rows?.selector) {
			return releases;
		}

		// Expand template in row selector
		let rowSelector = search.rows.selector;
		rowSelector = this.templateEngine.expand(rowSelector);

		// Select all rows
		const rows = this.selectorEngine.selectHtmlAll($, $.root(), rowSelector);

		// Skip rows if 'after' is specified
		const skipCount = search.rows.after ?? 0;
		const filteredRows = rows.slice(skipCount);

		// Handle date headers (sticky dates)
		let currentDate: string | null = null;
		const dateHeadersSelector = search.rows.dateheaders;

		for (const row of filteredRows) {
			try {
				// Check for date header
				if (dateHeadersSelector?.selector) {
					const dateResult = this.selectorEngine.selectHtml($, row, dateHeadersSelector, false);
					if (dateResult.value) {
						currentDate = dateResult.value;
						continue; // This row is just a date header, skip to next
					}
				}

				const release = this.extractReleaseFromHtml($, row, context, currentDate);
				if (release) releases.push(release);
			} catch (error) {
				logger.warn('Failed to parse HTML row', {
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return releases;
	}

	/**
	 * Extract release from HTML row.
	 */
	private extractReleaseFromHtml(
		$: CheerioAPI,
		row: Cheerio<Element>,
		context: ParseContext,
		stickyDate: string | null
	): ReleaseResult | null {
		const search = this.definition.search;
		const fields = search.fields;

		if (!fields) return null;

		const values: Record<string, string | null> = {};

		// Extract all field values
		for (const [fieldName, fieldDef] of Object.entries(fields)) {
			try {
				const result = this.selectorEngine.selectHtml(
					$,
					row,
					fieldDef,
					!this.isOptionalField(fieldName, fieldDef)
				);
				values[fieldName.toLowerCase()] = result.value;
			} catch (error) {
				if (!this.isOptionalField(fieldName, fieldDef)) {
					logger.warn('Required field extraction failed', {
						fieldName,
						error: error instanceof Error ? error.message : String(error)
					});
				}
				values[fieldName.toLowerCase()] = null;
			}
		}

		// Apply sticky date if no date was extracted
		if (stickyDate && !values['date'] && !values['publishdate']) {
			values['date'] = stickyDate;
		}

		return this.buildReleaseResult(values, context);
	}

	/**
	 * Check if a field is optional.
	 */
	private isOptionalField(name: string, fieldDef: FieldDefinition): boolean {
		const lowerName = name.toLowerCase();

		// These fields are always optional
		const optionalFields = [
			'imdb',
			'imdbid',
			'tmdb',
			'tmdbid',
			'tvdb',
			'tvdbid',
			'description',
			'poster',
			'banner',
			'genre',
			'rageid',
			'tvmazeid',
			'traktid',
			'doubanid'
		];
		if (optionalFields.includes(lowerName)) {
			return true;
		}

		// Check field definition
		if (typeof fieldDef === 'object' && fieldDef.optional) {
			return true;
		}

		return false;
	}

	/**
	 * Build ReleaseResult from extracted field values.
	 */
	private buildReleaseResult(
		values: Record<string, string | null>,
		context: ParseContext
	): ReleaseResult | null {
		// Required fields
		const title = values['title'];
		if (!title) return null;

		// Get download URL (required)
		const downloadUrl =
			values['download'] ||
			values['downloadurl'] ||
			values['magnet'] ||
			values['magneturl'] ||
			values['magneturi'];
		if (!downloadUrl && !values['infohash'] && !values['hash']) {
			return null;
		}

		// Build categories
		const categories = this.parseCategories(values);

		// Parse date
		let publishDate = new Date();
		const dateStr = values['date'] || values['publishdate'];
		if (dateStr) {
			const parsed = this.parseDate(dateStr);
			if (parsed) publishDate = parsed;
		}

		// Parse size
		let size = 0;
		const sizeStr = values['size'];
		if (sizeStr) {
			size = this.parseSizeValue(sizeStr);
		}

		// Build GUID
		let guid = values['guid'];
		if (!guid) {
			// Generate GUID from download URL or infohash
			const infoHash = values['infohash'] || values['hash'];
			guid = infoHash || downloadUrl || `${context.indexerId}-${title}-${Date.now()}`;
		}

		// Make URLs absolute
		const baseUrl = context.baseUrl;

		const result: ReleaseResult = {
			guid: String(guid),
			title: title,
			downloadUrl: this.makeAbsoluteUrl(downloadUrl || '', baseUrl),
			publishDate,
			size,
			indexerId: context.indexerId,
			indexerName: context.indexerName,
			protocol: context.protocol,
			categories
		};

		// Optional fields
		const magnetUrl = values['magnet'] || values['magneturl'] || values['magneturi'];
		if (magnetUrl) {
			result.magnetUrl = magnetUrl; // Magnet URLs are already absolute
		}

		const infoHash = values['infohash'] || values['hash'];
		if (infoHash) {
			result.infoHash = infoHash.toLowerCase();
		}

		const commentsUrl = values['details'] || values['comments'];
		if (commentsUrl) {
			result.commentsUrl = this.makeAbsoluteUrl(commentsUrl, baseUrl);
		}

		const seedersStr = values['seeders'];
		if (seedersStr) {
			const seeders = parseInt(seedersStr.replace(/[^\d]/g, ''), 10);
			if (!isNaN(seeders)) result.seeders = seeders;
		}

		const leechersStr = values['leechers'] || values['peers'];
		if (leechersStr) {
			const leechers = parseInt(leechersStr.replace(/[^\d]/g, ''), 10);
			if (!isNaN(leechers)) result.leechers = leechers;
		}

		const grabsStr = values['grabs'];
		if (grabsStr) {
			const grabs = parseInt(grabsStr.replace(/[^\d]/g, ''), 10);
			if (!isNaN(grabs)) result.grabs = grabs;
		}

		// External IDs
		const imdbId = values['imdb'] || values['imdbid'];
		if (imdbId) {
			result.imdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
		}

		const tmdbIdStr = values['tmdb'] || values['tmdbid'];
		if (tmdbIdStr) {
			const tmdbId = parseInt(tmdbIdStr, 10);
			if (!isNaN(tmdbId)) result.tmdbId = tmdbId;
		}

		const tvdbIdStr = values['tvdb'] || values['tvdbid'];
		if (tvdbIdStr) {
			const tvdbId = parseInt(tvdbIdStr, 10);
			if (!isNaN(tvdbId)) result.tvdbId = tvdbId;
		}

		return result;
	}

	/**
	 * Parse categories from extracted values.
	 * Returns category IDs as numeric values (Category enum values).
	 */
	private parseCategories(values: Record<string, string | null>): Category[] {
		const categories: Category[] = [];
		const catValue = values['category'] || values['cat'] || values['categoryid'];

		if (!catValue) {
			// Use default categories from definition
			return this.getDefaultCategories();
		}

		// Try to parse as category ID
		const catId = parseInt(catValue, 10);
		if (!isNaN(catId)) {
			// Category enum values are numbers, so just use the number
			categories.push(catId as Category);
		} else {
			// Use category mapping from definition
			const mappedCat = this.findCategoryMapping(catValue);
			if (mappedCat !== null) {
				categories.push(mappedCat);
			}
		}

		return categories;
	}

	/**
	 * Get default categories from definition.
	 */
	private getDefaultCategories(): Category[] {
		const caps = this.definition.caps;

		// Check categorymappings for defaults
		if (caps.categorymappings) {
			for (const mapping of caps.categorymappings) {
				if (mapping.default && mapping.cat) {
					const catId = parseInt(mapping.cat, 10);
					return [catId as Category];
				}
			}
		}

		// Check simple categories
		if (caps.categories) {
			const first = Object.entries(caps.categories)[0];
			if (first) {
				const [id] = first;
				return [parseInt(id, 10) as Category];
			}
		}

		return [];
	}

	/**
	 * Find category mapping by tracker-specific ID.
	 * Returns category ID as a numeric value.
	 */
	private findCategoryMapping(trackerId: string): Category | null {
		const caps = this.definition.caps;

		// Check categorymappings
		if (caps.categorymappings) {
			for (const mapping of caps.categorymappings) {
				if (mapping.id === trackerId && mapping.cat) {
					return parseInt(mapping.cat, 10) as Category;
				}
			}
		}

		// Check simple categories
		if (caps.categories && caps.categories[trackerId]) {
			return parseInt(trackerId, 10) as Category;
		}

		return null;
	}

	/**
	 * Parse size value to bytes.
	 */
	private parseSizeValue(sizeStr: string): number {
		// Remove commas
		sizeStr = sizeStr.replace(/,/g, '');

		// Check if it's already a number (bytes)
		const numOnly = parseFloat(sizeStr);
		if (!isNaN(numOnly) && sizeStr.match(/^\d+$/)) {
			return Math.round(numOnly);
		}

		// Parse with unit
		return parseSize(sizeStr);
	}

	/**
	 * Parse date string to Date object.
	 */
	private parseDate(dateStr: string): Date | null {
		// Already formatted as RFC 1123 from filters
		const parsed = new Date(dateStr);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}

		// Try parsing as Unix timestamp
		const timestamp = parseInt(dateStr, 10);
		if (!isNaN(timestamp)) {
			// Check if it's seconds or milliseconds
			if (timestamp > 1e12) {
				return new Date(timestamp);
			} else {
				return new Date(timestamp * 1000);
			}
		}

		return null;
	}

	/**
	 * Make URL absolute using base URL.
	 */
	private makeAbsoluteUrl(url: string, baseUrl: string): string {
		if (!url) return url;
		if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('magnet:')) {
			return url;
		}

		try {
			return new URL(url, baseUrl).toString();
		} catch {
			return url;
		}
	}
}

/**
 * Create a new ResponseParser instance.
 */
export function createResponseParser(
	definition: CardigannDefinition,
	templateEngine: TemplateEngine,
	filterEngine: FilterEngine,
	selectorEngine: SelectorEngine
): ResponseParser {
	return new ResponseParser(definition, templateEngine, filterEngine, selectorEngine);
}
