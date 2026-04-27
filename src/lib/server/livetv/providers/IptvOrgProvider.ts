/**
 * IPTV-Org Provider
 *
 * Implements the LiveTvProvider interface for IPTV-Org's free IPTV API.
 * Fetches free IPTV channels from https://github.com/iptv-org/api
 */

import { db } from '$lib/server/db';
import { livetvAccounts, livetvChannels, livetvCategories } from '$lib/server/db/schema';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { createChildLogger } from '$lib/logging';
import { getStreamingIndexerSettings } from '$lib/server/streaming/settings.js';
import { randomUUID } from 'crypto';

const logger = createChildLogger({ logDomain: 'livetv' as const });

const CINEPHAGE_API_BASE = 'https://api.cinephage.net';

import type {
	LiveTvProvider,
	AuthResult,
	StreamResolutionResult,
	ProviderCapabilities,
	LiveTvAccount,
	LiveTvChannel,
	LiveTvCategory,
	ChannelSyncResult,
	EpgProgram,
	LiveTvAccountTestResult,
	IptvOrgConfig,
	M3uChannelData
} from '$lib/types/livetv';
import { recordToAccount } from '../LiveTvAccountManager.js';

export class IptvOrgProvider implements LiveTvProvider {
	readonly type = 'iptvorg';

	readonly capabilities: ProviderCapabilities = {
		supportsEpg: true,
		supportsArchive: false,
		supportsCategories: true,
		requiresAuthentication: false,
		streamUrlExpires: false
	};

	getDisplayName(): string {
		return 'IPTV-Org (Free Channels)';
	}

	// ============================================================================
	// Authentication (IPTV-Org doesn't require auth)
	// ============================================================================

	async authenticate(_account: LiveTvAccount): Promise<AuthResult> {
		return {
			success: true,
			token: 'iptvorg_no_auth_required'
		};
	}

	async testConnection(account: LiveTvAccount): Promise<LiveTvAccountTestResult> {
		try {
			const config = account.iptvOrgConfig;
			if (!config) {
				return {
					success: false,
					error: 'IPTV-Org config not found'
				};
			}

			// Test by fetching channels and streams
			const channels = await this.fetchIptvOrgChannels(config);
			const streams = await this.fetchIptvOrgStreams(config);

			// Match channels to streams
			const matchedChannels = this.matchChannelsToStreams(channels, streams, config);

			// Get unique categories
			const categories = new Set<string>();
			for (const channel of channels) {
				if (channel.categories) {
					channel.categories.forEach((c) => categories.add(c));
				}
			}

			return {
				success: true,
				profile: {
					playbackLimit: 0,
					channelCount: matchedChannels.length,
					categoryCount: categories.size,
					expiresAt: null,
					serverTimezone: 'UTC',
					streamVerified: false
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: message
			};
		}
	}

	isAuthenticated(_account: LiveTvAccount): boolean {
		return true;
	}

	// ============================================================================
	// Channel Sync
	// ============================================================================

	async syncChannels(accountId: string): Promise<ChannelSyncResult> {
		const startTime = Date.now();

		try {
			const accountRecord = await db
				.select()
				.from(livetvAccounts)
				.where(eq(livetvAccounts.id, accountId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!accountRecord) {
				throw new Error(`Account not found: ${accountId}`);
			}

			const account = recordToAccount(accountRecord);
			const config = account.iptvOrgConfig;

			if (!config) {
				throw new Error('IPTV-Org config not found for account');
			}

			// Verify auth is configured
			await this.getAuthHeaders();

			logger.info('[IptvOrgProvider] Fetching playlist from Cinephage API');
			const playlistContent = await this.fetchCinephagePlaylist(config);
			const entries = this.parseIptvPlaylist(playlistContent);

			logger.info({ count: entries.length }, '[IptvOrgProvider] Parsed playlist entries');

			// Collect unique categories from parsed entries
			const categoryNames = new Set<string>();
			for (const entry of entries) {
				if (entry.groupTitle) {
					categoryNames.add(entry.groupTitle);
				}
			}

			// Get existing categories
			const existingCategories = await db
				.select()
				.from(livetvCategories)
				.where(eq(livetvCategories.accountId, accountId));

			const categoryMap = new Map(existingCategories.map((c) => [c.externalId, c.id]));
			let categoriesAdded = 0;
			let categoriesUpdated = 0;

			for (const categoryName of categoryNames) {
				const existingId = categoryMap.get(categoryName);

				if (existingId) {
					await db
						.update(livetvCategories)
						.set({
							title: categoryName,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvCategories.id, existingId));
					categoriesUpdated++;
				} else {
					const newId = randomUUID();
					await db.insert(livetvCategories).values({
						accountId,
						providerType: 'iptvorg',
						externalId: categoryName,
						title: categoryName,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					categoryMap.set(categoryName, newId);
					categoriesAdded++;
				}
			}

			// Get existing channels
			const existingChannels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, accountId));

			const channelMap = new Map(existingChannels.map((c) => [c.externalId, c.id]));
			let channelsAdded = 0;
			let channelsUpdated = 0;
			let channelsRemoved = 0;

			// Sync channels from playlist entries
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];

				const m3uData: M3uChannelData = {
					tvgId: entry.channelId,
					tvgName: entry.name,
					groupTitle: entry.groupTitle,
					url: entry.url,
					tvgLogo: entry.logo,
					attributes: {}
				};

				const categoryId = entry.groupTitle
					? categoryMap.get(entry.groupTitle) ?? null
					: null;

				const existingId = channelMap.get(entry.channelId);

				if (existingId) {
					await db
						.update(livetvChannels)
						.set({
							name: entry.name,
							logo: entry.logo ?? null,
							categoryId,
							providerCategoryId: entry.groupTitle ?? null,
							m3uData,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvChannels.id, existingId));
					channelsUpdated++;
				} else {
					await db.insert(livetvChannels).values({
						accountId,
						providerType: 'iptvorg',
						externalId: entry.channelId,
						name: entry.name,
						logo: entry.logo ?? null,
						categoryId,
						providerCategoryId: entry.groupTitle ?? null,
						m3uData,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					channelsAdded++;
				}
			}

			// Remove stale channels
			const providerChannelIds = entries.map((entry) => entry.channelId);
			if (providerChannelIds.length > 0) {
				const deletedChannels = await db
					.delete(livetvChannels)
					.where(
						and(
							eq(livetvChannels.accountId, accountId),
							notInArray(livetvChannels.externalId, providerChannelIds)
						)
					);
				channelsRemoved = deletedChannels.changes ?? 0;
			}

			// Remove stale categories
			const providerCategoryIds = Array.from(categoryNames);
			const staleCategoryIds = existingCategories
				.filter((category) => !providerCategoryIds.includes(category.externalId))
				.map((category) => category.id);

			if (staleCategoryIds.length > 0) {
				await db.delete(livetvCategories).where(inArray(livetvCategories.id, staleCategoryIds));
			}

			// Update account sync status
			await db
				.update(livetvAccounts)
				.set({
					channelCount: entries.length,
					categoryCount: categoryNames.size,
					lastSyncAt: new Date().toISOString(),
					lastSyncError: null,
					syncStatus: 'success',
					iptvOrgConfig: {
						...config,
						lastSyncAt: new Date().toISOString()
					}
				})
				.where(eq(livetvAccounts.id, accountId));

			const duration = Date.now() - startTime;

			logger.info(
				{
					accountId,
					categoriesAdded,
					categoriesUpdated,
					channelsAdded,
					channelsUpdated,
					channelsRemoved,
					duration
				},
				'[IptvOrgProvider] Channel sync completed via Cinephage API'
			);

			return {
				success: true,
				categoriesAdded,
				categoriesUpdated,
				channelsAdded,
				channelsUpdated,
				channelsRemoved,
				duration
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const duration = Date.now() - startTime;

			logger.error({ accountId, err: error }, '[IptvOrgProvider] Channel sync failed');

			await db
				.update(livetvAccounts)
				.set({
					lastSyncAt: new Date().toISOString(),
					lastSyncError: message,
					syncStatus: 'failed'
				})
				.where(eq(livetvAccounts.id, accountId));

			return {
				success: false,
				categoriesAdded: 0,
				categoriesUpdated: 0,
				channelsAdded: 0,
				channelsUpdated: 0,
				channelsRemoved: 0,
				duration,
				error: message
			};
		}
	}

	async fetchCategories(_account: LiveTvAccount): Promise<LiveTvCategory[]> {
		return [];
	}

	async fetchChannels(_account: LiveTvAccount): Promise<LiveTvChannel[]> {
		return [];
	}

	// ============================================================================
	// Stream Resolution
	// ============================================================================

	async resolveStreamUrl(
		account: LiveTvAccount,
		channel: LiveTvChannel,
		_format?: 'ts' | 'hls'
	): Promise<StreamResolutionResult> {
		try {
			const m3uData = channel.m3u;

			if (!m3uData?.url) {
				return {
					success: false,
					type: 'unknown',
					error: 'Channel has no stream URL'
				};
			}

			const headers: Record<string, string> = {};
			if (m3uData.attributes?.referrer) {
				headers['Referer'] = m3uData.attributes.referrer;
			}
			if (m3uData.attributes?.['user-agent']) {
				headers['User-Agent'] = m3uData.attributes['user-agent'];
			}

			const type = this.detectStreamType(m3uData.url);

			return {
				success: true,
				url: m3uData.url,
				type,
				headers: Object.keys(headers).length > 0 ? headers : undefined
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				type: 'unknown',
				error: message
			};
		}
	}

	// ============================================================================
	// EPG (Supported via IPTV-Org guides)
	// ============================================================================

	hasEpgSupport(): boolean {
		return true;
	}

	async fetchEpg(account: LiveTvAccount, _startTime: Date, _endTime: Date): Promise<EpgProgram[]> {
		try {
			// IPTV-Org provides guide metadata but not actual EPG data
			// The guides point to external EPG sources that would need to be fetched separately
			// For now, we return empty as we'd need to implement external EPG fetching
			logger.debug(
				'[IptvOrgProvider] EPG fetch not yet implemented - would need external EPG integration'
			);
			return [];
		} catch (error) {
			logger.error({ accountId: account.id, err: error }, '[IptvOrgProvider] EPG fetch failed');
			return [];
		}
	}

	// ============================================================================
	// Archive (Not supported by IPTV-Org)
	// ============================================================================

	supportsArchive(): boolean {
		return false;
	}

	// ============================================================================
	// Private Helpers
	// ============================================================================

	private async fetchCinephagePlaylist(config: IptvOrgConfig): Promise<string> {
		const params = new URLSearchParams();

		if (config.countries && config.countries.length > 0) {
			for (const country of config.countries) {
				params.append('country', country);
			}
		}

		if (config.categories && config.categories.length > 0) {
			for (const category of config.categories) {
				params.append('category', category);
			}
		}

		const url = `${CINEPHAGE_API_BASE}/api/v1/iptv/playlist.m3u?${params.toString()}`;
		const headers = await this.getAuthHeaders();

		const response = await fetch(url, {
			headers: {
				...headers,
				Accept: 'audio/x-mpegurl, text/plain, */*'
			},
			signal: AbortSignal.timeout(60000)
		});

		if (!response.ok) {
			if (response.status === 401) {
				throw new Error('Cinephage API rejected authentication. Verify version and commit.');
			}
			if (response.status === 429) {
				throw new Error('Cinephage API rate limited the IPTV request.');
			}
			throw new Error(`Cinephage API returned HTTP ${response.status}`);
		}

		return response.text();
	}

	private parseIptvPlaylist(content: string): Array<{
		channelId: string;
		name: string;
		logo?: string;
		groupTitle?: string;
		resolution?: string;
		sourceProvider?: string;
		url: string;
	}> {
		const entries: Array<{
			channelId: string;
			name: string;
			logo?: string;
			groupTitle?: string;
			resolution?: string;
			sourceProvider?: string;
			url: string;
		}> = [];

		const lines = content.split('\n');
		let currentAttrs: Record<string, string> = {};
		let currentName = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			if (line.startsWith('#EXTM3U')) {
				continue;
			}

			if (line.startsWith('#EXTINF:')) {
				const match = line.match(/#EXTINF:([^,]*),(.*)/);
				if (match) {
					currentName = match[2].trim();
					currentAttrs = this.parseM3uAttributes(match[1]);
				}
			} else if (line && !line.startsWith('#')) {
				const channelId = currentAttrs['tvg-id'];
				if (channelId) {
					entries.push({
						channelId,
						name: currentAttrs['tvg-name'] || currentName || 'Unknown',
						logo: currentAttrs['tvg-logo'],
						groupTitle: currentAttrs['group-title'],
						resolution: currentAttrs['tvg-resolution'],
						sourceProvider: currentAttrs['tvg-source'],
						url: line
					});
				}

				currentAttrs = {};
				currentName = '';
			}
		}

		return entries;
	}

	private parseM3uAttributes(attributesString: string): Record<string, string> {
		const attributes: Record<string, string> = {};
		const attrRegex = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
		let attrMatch: RegExpExecArray | null;

		while ((attrMatch = attrRegex.exec(attributesString)) !== null) {
			const key = attrMatch[1].toLowerCase();
			const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
			attributes[key] = value;
		}

		return attributes;
	}

	private detectStreamType(url: string): 'hls' | 'direct' | 'unknown' {
		const lowerUrl = url.toLowerCase();
		if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/')) {
			return 'hls';
		}
		if (lowerUrl.includes('.ts') || lowerUrl.includes('.mp4')) {
			return 'direct';
		}
		return 'unknown';
	}

	private async getAuthHeaders(): Promise<Record<string, string>> {
		const settings = await getStreamingIndexerSettings();
		const version = settings?.cinephageVersion;
		const commit = settings?.cinephageCommit;

		if (!version || !commit) {
			throw new Error('Cinephage API not configured: missing cinephageVersion or cinephageCommit');
		}

		return {
			'X-Cinephage-Version': version,
			'X-Cinephage-Commit': commit
		};
	}
}

// Singleton instance
let iptvOrgProviderInstance: IptvOrgProvider | null = null;

export function getIptvOrgProvider(): IptvOrgProvider {
	if (!iptvOrgProviderInstance) {
		iptvOrgProviderInstance = new IptvOrgProvider();
	}
	return iptvOrgProviderInstance;
}
