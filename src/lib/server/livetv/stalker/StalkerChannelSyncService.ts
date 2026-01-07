/**
 * Stalker Channel Sync Service
 *
 * Syncs channels and categories from Stalker Portal accounts to local database.
 * Handles large datasets (20K+ channels) with batched operations.
 */

import { eq, inArray, and, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	stalkerAccounts,
	stalkerCategories,
	stalkerChannels,
	type StalkerCategoryRecord,
	type StalkerChannelRecord
} from '$lib/server/db/schema';
import { logger } from '$lib/logging';
import { createStalkerClient } from './StalkerPortalClient';
import type { ChannelSyncResult, StalkerCategory, StalkerChannel } from '$lib/types/livetv';
import { randomUUID } from 'crypto';

const BATCH_SIZE = 1000;

export class StalkerChannelSyncService {
	/**
	 * Sync a single account - fetches all categories and channels from portal
	 */
	async syncAccount(accountId: string): Promise<ChannelSyncResult> {
		const startTime = Date.now();

		// Get account
		const account = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.id, accountId))
			.get();

		if (!account) {
			return {
				success: false,
				categoriesAdded: 0,
				categoriesUpdated: 0,
				channelsAdded: 0,
				channelsUpdated: 0,
				channelsRemoved: 0,
				duration: Date.now() - startTime,
				error: 'Account not found'
			};
		}

		// Mark as syncing
		db.update(stalkerAccounts)
			.set({
				syncStatus: 'syncing',
				updatedAt: new Date().toISOString()
			})
			.where(eq(stalkerAccounts.id, accountId))
			.run();

		try {
			const client = createStalkerClient(account.portalUrl, account.macAddress);

			// Fetch categories
			logger.info('[StalkerChannelSync] Fetching categories', { accountId, name: account.name });
			const categories = await client.getGenres();

			// Fetch channels
			logger.info('[StalkerChannelSync] Fetching channels', { accountId, name: account.name });
			const channels = await client.getChannels();

			logger.info('[StalkerChannelSync] Fetched data from portal', {
				accountId,
				categories: categories.length,
				channels: channels.length
			});

			// Sync categories
			const categoryResult = await this.syncCategories(accountId, categories);

			// Build category ID map (stalkerId -> our local ID)
			const categoryMap = new Map<string, string>();
			const dbCategories = db
				.select()
				.from(stalkerCategories)
				.where(eq(stalkerCategories.accountId, accountId))
				.all();
			for (const cat of dbCategories) {
				categoryMap.set(cat.stalkerId, cat.id);
			}

			// Sync channels
			const channelResult = await this.syncChannels(accountId, channels, categoryMap);

			// Update account metadata
			const now = new Date().toISOString();
			db.update(stalkerAccounts)
				.set({
					syncStatus: 'success',
					lastSyncAt: now,
					lastSyncError: null,
					channelCount: channels.length,
					categoryCount: categories.length,
					updatedAt: now
				})
				.where(eq(stalkerAccounts.id, accountId))
				.run();

			const result: ChannelSyncResult = {
				success: true,
				categoriesAdded: categoryResult.added,
				categoriesUpdated: categoryResult.updated,
				channelsAdded: channelResult.added,
				channelsUpdated: channelResult.updated,
				channelsRemoved: channelResult.removed,
				duration: Date.now() - startTime
			};

			logger.info('[StalkerChannelSync] Sync completed', {
				accountId,
				name: account.name,
				...result
			});

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Mark as failed
			db.update(stalkerAccounts)
				.set({
					syncStatus: 'failed',
					lastSyncError: errorMessage,
					updatedAt: new Date().toISOString()
				})
				.where(eq(stalkerAccounts.id, accountId))
				.run();

			logger.error('[StalkerChannelSync] Sync failed', {
				accountId,
				name: account.name,
				error: errorMessage
			});

			return {
				success: false,
				categoriesAdded: 0,
				categoriesUpdated: 0,
				channelsAdded: 0,
				channelsUpdated: 0,
				channelsRemoved: 0,
				duration: Date.now() - startTime,
				error: errorMessage
			};
		}
	}

	/**
	 * Sync all enabled accounts
	 */
	async syncAllAccounts(): Promise<Map<string, ChannelSyncResult>> {
		const accounts = db
			.select()
			.from(stalkerAccounts)
			.where(eq(stalkerAccounts.enabled, true))
			.all();

		const results = new Map<string, ChannelSyncResult>();

		for (const account of accounts) {
			const result = await this.syncAccount(account.id);
			results.set(account.id, result);
		}

		return results;
	}

	/**
	 * Sync categories for an account
	 */
	private async syncCategories(
		accountId: string,
		categories: StalkerCategory[]
	): Promise<{ added: number; updated: number }> {
		const now = new Date().toISOString();

		// Get existing categories
		const existing = db
			.select()
			.from(stalkerCategories)
			.where(eq(stalkerCategories.accountId, accountId))
			.all();

		const existingMap = new Map<string, StalkerCategoryRecord>();
		for (const cat of existing) {
			existingMap.set(cat.stalkerId, cat);
		}

		let added = 0;
		let updated = 0;

		// Process each category
		for (const category of categories) {
			// Skip the "All" pseudo-category
			if (category.id === '*') {
				continue;
			}

			const existingCat = existingMap.get(category.id);

			if (existingCat) {
				// Update if changed
				if (
					existingCat.title !== category.title ||
					existingCat.alias !== category.alias ||
					existingCat.censored !== category.censored
				) {
					db.update(stalkerCategories)
						.set({
							title: category.title,
							alias: category.alias,
							censored: category.censored,
							updatedAt: now
						})
						.where(eq(stalkerCategories.id, existingCat.id))
						.run();
					updated++;
				}
			} else {
				// Insert new
				db.insert(stalkerCategories)
					.values({
						id: randomUUID(),
						accountId,
						stalkerId: category.id,
						title: category.title,
						alias: category.alias,
						censored: category.censored,
						channelCount: 0,
						createdAt: now,
						updatedAt: now
					})
					.run();
				added++;
			}
		}

		// Delete categories that no longer exist
		const currentIds = new Set(categories.map((c) => c.id).filter((id) => id !== '*'));
		const toDelete = existing.filter((e) => !currentIds.has(e.stalkerId));

		if (toDelete.length > 0) {
			db.delete(stalkerCategories)
				.where(
					inArray(
						stalkerCategories.id,
						toDelete.map((c) => c.id)
					)
				)
				.run();
		}

		return { added, updated };
	}

	/**
	 * Sync channels for an account
	 */
	private async syncChannels(
		accountId: string,
		channels: StalkerChannel[],
		categoryMap: Map<string, string>
	): Promise<{ added: number; updated: number; removed: number }> {
		const now = new Date().toISOString();

		// Get existing channels
		const existing = db
			.select()
			.from(stalkerChannels)
			.where(eq(stalkerChannels.accountId, accountId))
			.all();

		const existingMap = new Map<string, StalkerChannelRecord>();
		for (const ch of existing) {
			existingMap.set(ch.stalkerId, ch);
		}

		let added = 0;
		let updated = 0;

		// Process channels in batches
		const toInsert: (typeof stalkerChannels.$inferInsert)[] = [];
		const toUpdate: { id: string; data: Partial<typeof stalkerChannels.$inferInsert> }[] = [];

		for (const channel of channels) {
			const existingCh = existingMap.get(channel.id);
			const categoryId = categoryMap.get(channel.genreId) ?? null;

			if (existingCh) {
				// Check if needs update
				if (
					existingCh.name !== channel.name ||
					existingCh.number !== channel.number ||
					existingCh.logo !== channel.logo ||
					existingCh.categoryId !== categoryId ||
					existingCh.cmd !== channel.cmd ||
					existingCh.tvArchive !== channel.tvArchive ||
					existingCh.archiveDuration !== channel.archiveDuration
				) {
					toUpdate.push({
						id: existingCh.id,
						data: {
							name: channel.name,
							number: channel.number,
							logo: channel.logo,
							categoryId,
							stalkerGenreId: channel.genreId,
							cmd: channel.cmd,
							tvArchive: channel.tvArchive,
							archiveDuration: channel.archiveDuration,
							updatedAt: now
						}
					});
				}
			} else {
				// New channel
				toInsert.push({
					id: randomUUID(),
					accountId,
					stalkerId: channel.id,
					name: channel.name,
					number: channel.number,
					logo: channel.logo,
					categoryId,
					stalkerGenreId: channel.genreId,
					cmd: channel.cmd,
					tvArchive: channel.tvArchive,
					archiveDuration: channel.archiveDuration,
					createdAt: now,
					updatedAt: now
				});
			}
		}

		// Batch insert new channels
		for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
			const batch = toInsert.slice(i, i + BATCH_SIZE);
			db.insert(stalkerChannels).values(batch).run();
			added += batch.length;

			if (i + BATCH_SIZE < toInsert.length) {
				logger.debug('[StalkerChannelSync] Inserted batch', {
					accountId,
					progress: `${i + batch.length}/${toInsert.length}`
				});
			}
		}

		// Batch update existing channels
		for (const update of toUpdate) {
			db.update(stalkerChannels).set(update.data).where(eq(stalkerChannels.id, update.id)).run();
			updated++;
		}

		// Delete channels that no longer exist
		const currentIds = new Set(channels.map((c) => c.id));
		const toDelete = existing.filter((e) => !currentIds.has(e.stalkerId));
		const removed = toDelete.length;

		if (toDelete.length > 0) {
			// Delete in batches
			for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
				const batch = toDelete.slice(i, i + BATCH_SIZE);
				db.delete(stalkerChannels)
					.where(
						inArray(
							stalkerChannels.id,
							batch.map((c) => c.id)
						)
					)
					.run();
			}
		}

		// Update category channel counts
		await this.updateCategoryChannelCounts(accountId);

		return { added, updated, removed };
	}

	/**
	 * Update channel counts on categories
	 */
	private async updateCategoryChannelCounts(accountId: string): Promise<void> {
		// Get counts per category
		const counts = db
			.select({
				categoryId: stalkerChannels.categoryId,
				count: sql<number>`count(*)`
			})
			.from(stalkerChannels)
			.where(eq(stalkerChannels.accountId, accountId))
			.groupBy(stalkerChannels.categoryId)
			.all();

		const countMap = new Map<string, number>();
		for (const row of counts) {
			if (row.categoryId) {
				countMap.set(row.categoryId, row.count);
			}
		}

		// Update all categories for this account
		const categories = db
			.select()
			.from(stalkerCategories)
			.where(eq(stalkerCategories.accountId, accountId))
			.all();

		for (const cat of categories) {
			const count = countMap.get(cat.id) ?? 0;
			if (cat.channelCount !== count) {
				db.update(stalkerCategories)
					.set({ channelCount: count })
					.where(eq(stalkerCategories.id, cat.id))
					.run();
			}
		}
	}

	/**
	 * Check if an account needs sync (based on time threshold)
	 */
	needsSync(
		account: { lastSyncAt: string | null; syncStatus: string },
		maxAgeHours: number
	): boolean {
		if (account.syncStatus === 'never' || !account.lastSyncAt) {
			return true;
		}

		const lastSync = new Date(account.lastSyncAt);
		const ageMs = Date.now() - lastSync.getTime();
		const ageHours = ageMs / (1000 * 60 * 60);

		return ageHours >= maxAgeHours;
	}

	/**
	 * Get accounts that have never been synced
	 */
	async getAccountsNeedingSync(): Promise<string[]> {
		const accounts = db
			.select({ id: stalkerAccounts.id })
			.from(stalkerAccounts)
			.where(and(eq(stalkerAccounts.enabled, true), eq(stalkerAccounts.syncStatus, 'never')))
			.all();

		return accounts.map((a) => a.id);
	}
}

// Singleton instance
let syncServiceInstance: StalkerChannelSyncService | null = null;

/**
 * Get the singleton StalkerChannelSyncService instance
 */
export function getStalkerChannelSyncService(): StalkerChannelSyncService {
	if (!syncServiceInstance) {
		syncServiceInstance = new StalkerChannelSyncService();
	}
	return syncServiceInstance;
}
