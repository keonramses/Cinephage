/**
 * Stalker Portal Client
 *
 * Client for communicating with Stalker/Ministra protocol IPTV portals.
 * Handles authentication via MAC address and token management.
 */

import { logger } from '$lib/logging';
import type {
	StalkerAccountTestResult,
	StalkerRawProfile,
	StalkerCategory,
	StalkerChannel,
	EpgProgramRaw
} from '$lib/types/livetv';

const REQUEST_TIMEOUT = 10000; // 10 seconds
const USER_AGENT =
	'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';

interface StalkerResponse<T> {
	js: T;
}

interface HandshakeResponse {
	token: string;
	random: string;
}

interface GenresResponse {
	id: string;
	title: string;
	alias: string;
	censored: string;
}

interface ChannelData {
	id: string;
	name: string;
	number: string;
	logo: string;
	tv_genre_id: string;
	cmd: string;
	tv_archive: string;
	tv_archive_duration: string;
}

interface ChannelsResponse {
	data: ChannelData[];
	total_items: number;
}

interface AccountInfoResponse {
	mac: string;
	phone: string;
}

interface EpgInfoResponse {
	data: Record<string, EpgProgramData[]>;
}

interface EpgProgramData {
	id: string;
	ch_id: string;
	time: string;
	time_to: string;
	duration: number;
	name: string;
	descr: string;
	category: string;
	director: string;
	actor: string;
	start_timestamp: number;
	stop_timestamp: number;
	mark_archive: number;
}

export class StalkerPortalClient {
	protected portalUrl: string;
	protected macAddress: string;
	protected token: string | null = null;

	constructor(portalUrl: string, macAddress: string) {
		// Normalize portal URL - ensure it doesn't end with slash
		this.portalUrl = portalUrl.replace(/\/+$/, '');
		this.macAddress = macAddress.toUpperCase();
	}

	/**
	 * URL-encode MAC address for cookie use
	 */
	private encodeMAC(): string {
		return encodeURIComponent(this.macAddress);
	}

	/**
	 * Get the portal.php endpoint URL
	 */
	private getPortalEndpoint(): string {
		// Handle different portal URL formats
		if (this.portalUrl.includes('/portal.php')) {
			return this.portalUrl;
		}
		if (this.portalUrl.endsWith('/c') || this.portalUrl.endsWith('/c/')) {
			return `${this.portalUrl.replace(/\/+$/, '')}/portal.php`;
		}
		// Default: append /portal.php
		return `${this.portalUrl}/portal.php`;
	}

	/**
	 * Build request headers
	 */
	private getHeaders(includeAuth: boolean = true): HeadersInit {
		const headers: HeadersInit = {
			'User-Agent': USER_AGENT,
			Cookie: `mac=${this.encodeMAC()}; stb_lang=en; timezone=UTC`
		};

		if (includeAuth && this.token) {
			headers['Authorization'] = `Bearer ${this.token}`;
		}

		return headers;
	}

	/**
	 * Make a request to the portal API
	 */
	protected async request<T>(
		type: string,
		action: string,
		params: Record<string, string> = {},
		includeAuth: boolean = true
	): Promise<T> {
		const endpoint = this.getPortalEndpoint();
		const url = new URL(endpoint);
		url.searchParams.set('type', type);
		url.searchParams.set('action', action);
		url.searchParams.set('JsHttpRequest', '1-xml');

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

		try {
			const response = await fetch(url.toString(), {
				method: 'GET',
				headers: this.getHeaders(includeAuth),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as StalkerResponse<T>;
			return data.js;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error('Request timed out');
			}
			throw error;
		}
	}

	/**
	 * Perform handshake to obtain authentication token
	 */
	async handshake(): Promise<string> {
		logger.debug('[StalkerPortal] Performing handshake', {
			portalUrl: this.portalUrl,
			mac: this.macAddress.substring(0, 8) + '...'
		});

		const result = await this.request<HandshakeResponse>('stb', 'handshake', {}, false);

		if (!result?.token) {
			throw new Error('Handshake failed: no token received');
		}

		this.token = result.token;
		logger.debug('[StalkerPortal] Handshake successful');
		return this.token;
	}

	/**
	 * Ensure we have a valid token
	 */
	protected async ensureToken(): Promise<void> {
		if (!this.token) {
			await this.handshake();
		}
	}

	/**
	 * Get account profile information
	 */
	async getProfile(): Promise<StalkerRawProfile> {
		await this.ensureToken();
		return this.request<StalkerRawProfile>('stb', 'get_profile');
	}

	/**
	 * Get account info (contains expiry in phone field for many providers)
	 */
	async getAccountInfo(): Promise<AccountInfoResponse | null> {
		await this.ensureToken();
		try {
			return await this.request<AccountInfoResponse>('account_info', 'get_main_info');
		} catch {
			// Some portals don't support this endpoint
			return null;
		}
	}

	/**
	 * Get channel categories/genres
	 */
	async getGenres(): Promise<StalkerCategory[]> {
		await this.ensureToken();
		const genres = await this.request<GenresResponse[]>('itv', 'get_genres');

		return genres.map((g) => ({
			id: g.id,
			title: g.title,
			alias: g.alias,
			censored: g.censored === '1'
		}));
	}

	/**
	 * Get all channels
	 */
	async getChannels(): Promise<StalkerChannel[]> {
		await this.ensureToken();
		const result = await this.request<ChannelsResponse | ChannelData[]>('itv', 'get_all_channels');

		// Some portals return an array directly, others return {data: [], total_items: N}
		const channels: ChannelData[] = Array.isArray(result)
			? result
			: (result as ChannelsResponse).data;
		if (!channels || !Array.isArray(channels)) {
			return [];
		}

		return channels.map((ch) => ({
			id: ch.id,
			name: ch.name,
			number: ch.number,
			logo: ch.logo,
			genreId: ch.tv_genre_id,
			cmd: ch.cmd,
			tvArchive: ch.tv_archive === '1',
			archiveDuration: parseInt(ch.tv_archive_duration, 10) || 0
		}));
	}

	/**
	 * Get channel count (more efficient than fetching all channels)
	 */
	async getChannelCount(): Promise<number> {
		await this.ensureToken();
		const result = await this.request<ChannelsResponse | ChannelData[]>('itv', 'get_all_channels');

		// Some portals return an array directly, others return {data: [], total_items: N}
		if (Array.isArray(result)) {
			return result.length;
		}
		const response = result as ChannelsResponse;
		return response.total_items || response.data?.length || 0;
	}

	/**
	 * Get EPG (Electronic Program Guide) data for all channels.
	 * @param period - Number of hours of EPG data to fetch (default: 24)
	 * @returns Map of channel ID to array of programs
	 */
	async getEpgInfo(period: number = 24): Promise<Map<string, EpgProgramRaw[]>> {
		await this.ensureToken();

		logger.debug('[StalkerPortal] Fetching EPG info', {
			portalUrl: this.portalUrl,
			period
		});

		try {
			const result = await this.request<EpgInfoResponse | Record<string, EpgProgramData[]>>(
				'itv',
				'get_epg_info',
				{ period: period.toString() }
			);

			// Response can be either { data: { channelId: programs[] } } or just { channelId: programs[] }
			let epgData: Record<string, EpgProgramData[]>;
			if ('data' in result && typeof result.data === 'object' && result.data !== null) {
				epgData = result.data as Record<string, EpgProgramData[]>;
			} else {
				epgData = result as Record<string, EpgProgramData[]>;
			}

			const programMap = new Map<string, EpgProgramRaw[]>();

			for (const [channelId, programs] of Object.entries(epgData)) {
				if (!Array.isArray(programs)) continue;

				const mappedPrograms: EpgProgramRaw[] = programs.map((p) => ({
					id: p.id,
					ch_id: p.ch_id || channelId,
					time: p.time,
					time_to: p.time_to,
					duration: Math.abs(p.duration), // Duration can be negative in some responses
					name: p.name || '',
					descr: p.descr || '',
					category: p.category || '',
					director: p.director || '',
					actor: p.actor || '',
					start_timestamp: p.start_timestamp,
					stop_timestamp: p.stop_timestamp,
					mark_archive: p.mark_archive || 0
				}));

				if (mappedPrograms.length > 0) {
					programMap.set(channelId, mappedPrograms);
				}
			}

			logger.debug('[StalkerPortal] EPG fetch complete', {
				channelCount: programMap.size,
				totalPrograms: Array.from(programMap.values()).reduce((sum, arr) => sum + arr.length, 0)
			});

			return programMap;
		} catch (error) {
			logger.error('[StalkerPortal] EPG fetch failed', {
				portalUrl: this.portalUrl,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			return new Map();
		}
	}

	/**
	 * Get short EPG (current and next program) for a single channel.
	 * More efficient than getEpgInfo when you only need current/next for one channel.
	 * @param channelId - Stalker channel ID
	 * @returns Array of programs (typically 1-2 items for current and next)
	 */
	async getShortEpg(channelId: string): Promise<EpgProgramRaw[]> {
		await this.ensureToken();

		try {
			const result = await this.request<EpgProgramData[]>('itv', 'get_short_epg', {
				ch_id: channelId
			});

			if (!Array.isArray(result)) {
				return [];
			}

			return result.map((p) => ({
				id: p.id,
				ch_id: p.ch_id || channelId,
				time: p.time,
				time_to: p.time_to,
				duration: Math.abs(p.duration),
				name: p.name || '',
				descr: p.descr || '',
				category: p.category || '',
				director: p.director || '',
				actor: p.actor || '',
				start_timestamp: p.start_timestamp,
				stop_timestamp: p.stop_timestamp,
				mark_archive: p.mark_archive || 0
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Parse expiration date from a string.
	 * Handles various formats like:
	 * - "January 19, 2027, 7:19 pm"
	 * - "2027-01-19 19:19:00"
	 * - "Jan 19, 2027"
	 */
	private parseExpiryFromString(value: string | null | undefined): string | null {
		if (!value || value === '0000-00-00 00:00:00' || value === '') {
			return null;
		}

		// Try direct parse first
		const parsed = new Date(value);
		if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
			return parsed.toISOString();
		}

		// Try to extract date from string (e.g., "January 19, 2027, 7:19 pm" or "Expires: Jan 19, 2027")
		const dateMatch = value.match(
			/(\w+\s+\d{1,2},?\s+\d{4})|(\d{4}-\d{2}-\d{2})|(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/
		);
		if (dateMatch) {
			const extracted = new Date(dateMatch[0]);
			if (!isNaN(extracted.getTime()) && extracted.getFullYear() > 2000) {
				return extracted.toISOString();
			}
		}

		return null;
	}

	/**
	 * Parse expiration date from profile data and account info.
	 * Different portals store expiry in different fields/endpoints.
	 */
	private parseExpiryDate(
		profile: StalkerRawProfile,
		accountInfo: AccountInfoResponse | null
	): string | null {
		// Try account_info phone field first (most reliable for many providers)
		if (accountInfo?.phone) {
			const fromAccountInfo = this.parseExpiryFromString(accountInfo.phone);
			if (fromAccountInfo) return fromAccountInfo;
		}

		// Try profile fields
		const candidates = [profile.expire_billing_date, profile.tariff_expired_date, profile.phone];

		for (const candidate of candidates) {
			const parsed = this.parseExpiryFromString(candidate);
			if (parsed) return parsed;
		}

		return null;
	}

	/**
	 * Determine account status from profile
	 */
	private getAccountStatus(
		profile: StalkerRawProfile,
		accountInfo: AccountInfoResponse | null
	): 'active' | 'blocked' | 'expired' {
		if (profile.blocked === '1') {
			return 'blocked';
		}

		// Check expiry
		const expiryDate = this.parseExpiryDate(profile, accountInfo);
		if (expiryDate) {
			const expiry = new Date(expiryDate);
			if (expiry < new Date()) {
				return 'expired';
			}
		}

		// Check status field
		if (profile.status === 0) {
			return 'blocked';
		}

		return 'active';
	}

	/**
	 * Test connection and fetch account metadata
	 */
	async testConnection(): Promise<StalkerAccountTestResult> {
		try {
			// Step 1: Handshake
			await this.handshake();

			// Step 2: Get profile
			const profile = await this.getProfile();

			// Step 3: Get account info (for expiry date)
			const accountInfo = await this.getAccountInfo();

			// Step 4: Get genres (categories)
			const genres = await this.getGenres();

			// Step 5: Get channel count
			const channelCount = await this.getChannelCount();

			// No channels = useless account
			if (channelCount === 0) {
				return {
					success: false,
					error: 'No channels available (portal may block API access)'
				};
			}

			const expiresAt = this.parseExpiryDate(profile, accountInfo);
			const status = this.getAccountStatus(profile, accountInfo);

			return {
				success: true,
				profile: {
					playbackLimit: profile.playback_limit || 1,
					channelCount,
					categoryCount: genres.length,
					expiresAt,
					serverTimezone: profile.default_timezone || 'UTC',
					status
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('[StalkerPortal] Connection test failed', {
				portalUrl: this.portalUrl,
				error: message
			});

			return {
				success: false,
				error: message
			};
		}
	}
}

/**
 * Create a new Stalker Portal client instance
 */
export function createStalkerClient(portalUrl: string, macAddress: string): StalkerPortalClient {
	return new StalkerPortalClient(portalUrl, macAddress);
}
