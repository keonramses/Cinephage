/**
 * ChannelLineupService - Manages user's custom channel lineup for Live TV.
 * Provides CRUD operations and ordering for lineup items.
 */

import { db } from '$lib/server/db';
import {
	channelLineupItems,
	channelLineupBackups,
	channelCategories,
	stalkerAccounts,
	stalkerChannels,
	stalkerCategories,
	type ChannelLineupItemRecord,
	type ChannelCategoryRecord,
	type StalkerChannelRecord
} from '$lib/server/db/schema';
import { eq, asc, inArray, sql, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { logger } from '$lib/logging';
import { randomUUID } from 'crypto';
import type {
	ChannelLineupItemWithDetails,
	ChannelLineupItemWithBackups,
	ChannelBackupLink,
	ChannelCategory,
	CachedChannel,
	AddToLineupRequest,
	UpdateChannelRequest
} from '$lib/types/livetv';

/**
 * Convert category record to API response format
 */
function toCategoryResponse(record: ChannelCategoryRecord | null): ChannelCategory | null {
	if (!record) return null;
	return {
		id: record.id,
		name: record.name,
		position: record.position,
		color: record.color,
		icon: record.icon,
		createdAt: record.createdAt || new Date().toISOString(),
		updatedAt: record.updatedAt || new Date().toISOString()
	};
}

/**
 * Convert channel record to cached channel format
 */
function toChannelResponse(
	record: StalkerChannelRecord,
	categoryTitle: string | null
): CachedChannel {
	return {
		id: record.id,
		accountId: record.accountId,
		stalkerId: record.stalkerId,
		name: record.name,
		number: record.number,
		logo: record.logo,
		categoryId: record.categoryId,
		categoryTitle,
		stalkerGenreId: record.stalkerGenreId,
		cmd: record.cmd,
		tvArchive: record.tvArchive ?? false,
		archiveDuration: record.archiveDuration ?? 0,
		createdAt: record.createdAt || new Date().toISOString(),
		updatedAt: record.updatedAt || new Date().toISOString()
	};
}

/**
 * Convert database record to API response format with computed display values
 */
function toLineupItem(
	record: ChannelLineupItemRecord,
	accountName: string,
	channel: StalkerChannelRecord,
	channelCategoryTitle: string | null,
	category: ChannelCategoryRecord | null = null,
	epgSourceChannel: StalkerChannelRecord | null = null,
	epgSourceCategoryTitle: string | null = null,
	epgSourceAccountName: string | null = null
): ChannelLineupItemWithDetails {
	const channelData = toChannelResponse(channel, channelCategoryTitle);

	return {
		id: record.id,
		accountId: record.accountId,
		channelId: record.channelId,
		position: record.position,
		channelNumber: record.channelNumber,
		customName: record.customName,
		customLogo: record.customLogo,
		epgId: record.epgId,
		epgSourceChannelId: record.epgSourceChannelId,
		categoryId: record.categoryId,
		addedAt: record.addedAt || new Date().toISOString(),
		updatedAt: record.updatedAt || new Date().toISOString(),
		channel: channelData,
		accountName,
		category: toCategoryResponse(category),
		displayName: record.customName || channel.name,
		displayLogo: record.customLogo || channel.logo,
		epgSourceChannel: epgSourceChannel
			? toChannelResponse(epgSourceChannel, epgSourceCategoryTitle)
			: null,
		epgSourceAccountName
	};
}

class ChannelLineupService {
	/**
	 * Get all lineup items ordered by position with joined data
	 */
	async getLineup(): Promise<ChannelLineupItemWithDetails[]> {
		// Create aliases for EPG source channel joins
		const epgSourceChannels = alias(stalkerChannels, 'epgSourceChannels');
		const epgSourceAccounts = alias(stalkerAccounts, 'epgSourceAccounts');

		const items = await db
			.select({
				item: channelLineupItems,
				accountName: stalkerAccounts.name,
				channel: stalkerChannels,
				category: channelCategories,
				epgSourceChannel: epgSourceChannels,
				epgSourceAccountName: epgSourceAccounts.name
			})
			.from(channelLineupItems)
			.innerJoin(stalkerAccounts, eq(channelLineupItems.accountId, stalkerAccounts.id))
			.innerJoin(stalkerChannels, eq(channelLineupItems.channelId, stalkerChannels.id))
			.leftJoin(channelCategories, eq(channelLineupItems.categoryId, channelCategories.id))
			.leftJoin(epgSourceChannels, eq(channelLineupItems.epgSourceChannelId, epgSourceChannels.id))
			.leftJoin(epgSourceAccounts, eq(epgSourceChannels.accountId, epgSourceAccounts.id))
			.orderBy(asc(channelLineupItems.position));

		// Get channel categories for the category title display (primary + EPG source)
		const allCategoryIds = [
			...new Set([
				...items.map((i) => i.channel.categoryId).filter(Boolean),
				...items.map((i) => i.epgSourceChannel?.categoryId).filter(Boolean)
			])
		];
		const channelCategoriesMap = new Map<string, string>();

		if (allCategoryIds.length > 0) {
			const cats = await db
				.select({ id: stalkerCategories.id, title: stalkerCategories.title })
				.from(stalkerCategories)
				.where(inArray(stalkerCategories.id, allCategoryIds as string[]));
			for (const cat of cats) {
				channelCategoriesMap.set(cat.id, cat.title);
			}
		}

		return items.map((row) =>
			toLineupItem(
				row.item,
				row.accountName || 'Unknown Account',
				row.channel,
				row.channel.categoryId ? channelCategoriesMap.get(row.channel.categoryId) || null : null,
				row.category,
				row.epgSourceChannel,
				row.epgSourceChannel?.categoryId
					? channelCategoriesMap.get(row.epgSourceChannel.categoryId) || null
					: null,
				row.epgSourceAccountName || null
			)
		);
	}

	/**
	 * Get a single lineup item by ID
	 */
	async getChannelById(id: string): Promise<ChannelLineupItemWithDetails | null> {
		// Create aliases for EPG source channel joins
		const epgSourceChannels = alias(stalkerChannels, 'epgSourceChannels');
		const epgSourceAccounts = alias(stalkerAccounts, 'epgSourceAccounts');

		const items = await db
			.select({
				item: channelLineupItems,
				accountName: stalkerAccounts.name,
				channel: stalkerChannels,
				category: channelCategories,
				epgSourceChannel: epgSourceChannels,
				epgSourceAccountName: epgSourceAccounts.name
			})
			.from(channelLineupItems)
			.innerJoin(stalkerAccounts, eq(channelLineupItems.accountId, stalkerAccounts.id))
			.innerJoin(stalkerChannels, eq(channelLineupItems.channelId, stalkerChannels.id))
			.leftJoin(channelCategories, eq(channelLineupItems.categoryId, channelCategories.id))
			.leftJoin(epgSourceChannels, eq(channelLineupItems.epgSourceChannelId, epgSourceChannels.id))
			.leftJoin(epgSourceAccounts, eq(epgSourceChannels.accountId, epgSourceAccounts.id))
			.where(eq(channelLineupItems.id, id))
			.limit(1);

		if (items.length === 0) return null;

		const row = items[0];

		// Get channel category titles (primary + EPG source)
		const categoryIds = [row.channel.categoryId, row.epgSourceChannel?.categoryId].filter(Boolean);
		const categoriesMap = new Map<string, string>();

		if (categoryIds.length > 0) {
			const cats = await db
				.select({ id: stalkerCategories.id, title: stalkerCategories.title })
				.from(stalkerCategories)
				.where(inArray(stalkerCategories.id, categoryIds as string[]));
			for (const cat of cats) {
				categoriesMap.set(cat.id, cat.title);
			}
		}

		return toLineupItem(
			row.item,
			row.accountName || 'Unknown Account',
			row.channel,
			row.channel.categoryId ? categoriesMap.get(row.channel.categoryId) || null : null,
			row.category,
			row.epgSourceChannel,
			row.epgSourceChannel?.categoryId
				? categoriesMap.get(row.epgSourceChannel.categoryId) || null
				: null,
			row.epgSourceAccountName || null
		);
	}

	/**
	 * Get lineup item count
	 */
	async getLineupCount(): Promise<number> {
		const result = await db.select({ count: sql<number>`count(*)` }).from(channelLineupItems);
		return result[0]?.count || 0;
	}

	/**
	 * Check if a channel is already in the lineup
	 */
	async isInLineup(channelId: string): Promise<boolean> {
		const existing = await db
			.select({ id: channelLineupItems.id })
			.from(channelLineupItems)
			.where(eq(channelLineupItems.channelId, channelId))
			.limit(1);
		return existing.length > 0;
	}

	/**
	 * Get set of channel IDs already in lineup (for bulk checking)
	 */
	async getLineupChannelIds(): Promise<Set<string>> {
		const items = await db
			.select({ channelId: channelLineupItems.channelId })
			.from(channelLineupItems);
		return new Set(items.map((i) => i.channelId));
	}

	/**
	 * Add channels to the lineup
	 */
	async addToLineup(request: AddToLineupRequest): Promise<{ added: number; skipped: number }> {
		if (request.channels.length === 0) {
			return { added: 0, skipped: 0 };
		}

		// Get existing channel IDs in lineup
		const existingIds = await this.getLineupChannelIds();

		// Get next position
		const maxPosResult = await db
			.select({ maxPos: sql<number>`COALESCE(MAX(position), 0)` })
			.from(channelLineupItems);
		let nextPosition = (maxPosResult[0]?.maxPos || 0) + 1;

		let added = 0;
		let skipped = 0;

		const now = new Date().toISOString();

		for (const channel of request.channels) {
			// Skip if already in lineup
			if (existingIds.has(channel.channelId)) {
				skipped++;
				continue;
			}

			await db.insert(channelLineupItems).values({
				id: randomUUID(),
				accountId: channel.accountId,
				channelId: channel.channelId,
				position: nextPosition++,
				categoryId: channel.categoryId || null,
				addedAt: now,
				updatedAt: now
			});

			added++;
			existingIds.add(channel.channelId);
		}

		logger.info('[ChannelLineupService] Added channels to lineup', { added, skipped });
		return { added, skipped };
	}

	/**
	 * Remove a channel from the lineup
	 */
	async removeFromLineup(id: string): Promise<boolean> {
		const result = await db.delete(channelLineupItems).where(eq(channelLineupItems.id, id));
		return result.changes > 0;
	}

	/**
	 * Remove multiple channels from the lineup
	 */
	async bulkRemoveFromLineup(ids: string[]): Promise<number> {
		if (ids.length === 0) return 0;

		const result = await db.delete(channelLineupItems).where(inArray(channelLineupItems.id, ids));

		logger.info('[ChannelLineupService] Removed channels from lineup', { count: result.changes });
		return result.changes;
	}

	/**
	 * Update a lineup item
	 */
	async updateChannel(
		id: string,
		update: UpdateChannelRequest
	): Promise<ChannelLineupItemWithDetails | null> {
		const now = new Date().toISOString();

		await db
			.update(channelLineupItems)
			.set({
				channelNumber: update.channelNumber,
				customName: update.customName,
				customLogo: update.customLogo,
				epgId: update.epgId,
				epgSourceChannelId: update.epgSourceChannelId,
				categoryId: update.categoryId,
				updatedAt: now
			})
			.where(eq(channelLineupItems.id, id));

		return this.getChannelById(id);
	}

	/**
	 * Reorder lineup items
	 */
	async reorderLineup(itemIds: string[]): Promise<void> {
		const now = new Date().toISOString();

		// Update positions in order
		for (let i = 0; i < itemIds.length; i++) {
			await db
				.update(channelLineupItems)
				.set({ position: i + 1, updatedAt: now })
				.where(eq(channelLineupItems.id, itemIds[i]));
		}

		logger.info('[ChannelLineupService] Reordered lineup', { count: itemIds.length });
	}

	/**
	 * Set category for multiple lineup items
	 */
	async bulkSetCategory(itemIds: string[], categoryId: string | null): Promise<number> {
		if (itemIds.length === 0) return 0;

		const now = new Date().toISOString();
		const result = await db
			.update(channelLineupItems)
			.set({ categoryId, updatedAt: now })
			.where(inArray(channelLineupItems.id, itemIds));

		return result.changes;
	}

	// =========================================================================
	// BACKUP LINKS
	// =========================================================================

	/**
	 * Get all backup links for a lineup item
	 */
	async getBackups(lineupItemId: string): Promise<ChannelBackupLink[]> {
		const rows = await db
			.select({
				backup: channelLineupBackups,
				channel: stalkerChannels,
				accountName: stalkerAccounts.name,
				categoryTitle: stalkerCategories.title
			})
			.from(channelLineupBackups)
			.innerJoin(stalkerChannels, eq(channelLineupBackups.channelId, stalkerChannels.id))
			.innerJoin(stalkerAccounts, eq(channelLineupBackups.accountId, stalkerAccounts.id))
			.leftJoin(stalkerCategories, eq(stalkerChannels.categoryId, stalkerCategories.id))
			.where(eq(channelLineupBackups.lineupItemId, lineupItemId))
			.orderBy(asc(channelLineupBackups.priority));

		return rows.map((row) => ({
			id: row.backup.id,
			lineupItemId: row.backup.lineupItemId,
			accountId: row.backup.accountId,
			channelId: row.backup.channelId,
			priority: row.backup.priority,
			createdAt: row.backup.createdAt || new Date().toISOString(),
			updatedAt: row.backup.updatedAt || new Date().toISOString(),
			channel: toChannelResponse(row.channel, row.categoryTitle || null),
			accountName: row.accountName || 'Unknown Account'
		}));
	}

	/**
	 * Add a backup link to a lineup item
	 */
	async addBackup(
		lineupItemId: string,
		accountId: string,
		channelId: string
	): Promise<ChannelBackupLink | null> {
		// Get the lineup item to check it exists and that we're not adding primary as backup
		const item = await this.getChannelById(lineupItemId);
		if (!item) {
			logger.warn('[ChannelLineupService] Cannot add backup: lineup item not found', {
				lineupItemId
			});
			return null;
		}

		// Prevent adding the primary channel as a backup
		if (channelId === item.channelId) {
			logger.warn('[ChannelLineupService] Cannot add primary channel as backup', {
				lineupItemId,
				channelId
			});
			return null;
		}

		// Get next priority (max + 1)
		const maxPriorityResult = await db
			.select({ maxPriority: sql<number>`COALESCE(MAX(priority), 0)` })
			.from(channelLineupBackups)
			.where(eq(channelLineupBackups.lineupItemId, lineupItemId));
		const nextPriority = (maxPriorityResult[0]?.maxPriority || 0) + 1;

		const now = new Date().toISOString();
		const id = randomUUID();

		try {
			await db.insert(channelLineupBackups).values({
				id,
				lineupItemId,
				accountId,
				channelId,
				priority: nextPriority,
				createdAt: now,
				updatedAt: now
			});

			logger.info('[ChannelLineupService] Added backup link', {
				lineupItemId,
				channelId,
				priority: nextPriority
			});

			// Return the newly created backup with joined data
			const backups = await this.getBackups(lineupItemId);
			return backups.find((b) => b.id === id) || null;
		} catch (error) {
			// Unique constraint violation - backup already exists
			if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
				logger.warn('[ChannelLineupService] Backup already exists', {
					lineupItemId,
					channelId
				});
				return null;
			}
			throw error;
		}
	}

	/**
	 * Remove a backup link
	 */
	async removeBackup(backupId: string): Promise<boolean> {
		const result = await db
			.delete(channelLineupBackups)
			.where(eq(channelLineupBackups.id, backupId));

		if (result.changes > 0) {
			logger.info('[ChannelLineupService] Removed backup link', { backupId });
			return true;
		}
		return false;
	}

	/**
	 * Reorder backup links for a lineup item
	 */
	async reorderBackups(lineupItemId: string, backupIds: string[]): Promise<void> {
		const now = new Date().toISOString();

		// Update priorities in order (1-based)
		for (let i = 0; i < backupIds.length; i++) {
			await db
				.update(channelLineupBackups)
				.set({ priority: i + 1, updatedAt: now })
				.where(
					and(
						eq(channelLineupBackups.id, backupIds[i]),
						eq(channelLineupBackups.lineupItemId, lineupItemId)
					)
				);
		}

		logger.info('[ChannelLineupService] Reordered backups', {
			lineupItemId,
			count: backupIds.length
		});
	}

	/**
	 * Get a lineup item with its backup links
	 */
	async getChannelWithBackups(id: string): Promise<ChannelLineupItemWithBackups | null> {
		const item = await this.getChannelById(id);
		if (!item) return null;

		const backups = await this.getBackups(id);

		return {
			...item,
			backups
		};
	}

	/**
	 * Get backup count for a lineup item
	 */
	async getBackupCount(lineupItemId: string): Promise<number> {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(channelLineupBackups)
			.where(eq(channelLineupBackups.lineupItemId, lineupItemId));
		return result[0]?.count || 0;
	}
}

export const channelLineupService = new ChannelLineupService();
