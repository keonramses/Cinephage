/**
 * Stalker Channel Service
 *
 * Query service for cached channels and categories.
 * Provides filtering, search, and pagination for large channel lists.
 */

import { eq, inArray, like, and, asc, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { stalkerAccounts, stalkerCategories, stalkerChannels } from '$lib/server/db/schema';
import type {
	CachedChannel,
	CachedCategory,
	ChannelQueryOptions,
	PaginatedChannelResponse,
	AccountSyncStatus
} from '$lib/types/livetv';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export class StalkerChannelService {
	/**
	 * Get channels with filtering and pagination
	 */
	async getChannels(options: ChannelQueryOptions = {}): Promise<PaginatedChannelResponse> {
		const {
			accountIds,
			categoryIds,
			search,
			hasArchive,
			page = 1,
			pageSize = DEFAULT_PAGE_SIZE,
			sortBy = 'name',
			sortOrder = 'asc'
		} = options;

		const effectivePageSize = Math.min(pageSize, MAX_PAGE_SIZE);
		const offset = (page - 1) * effectivePageSize;

		// Build conditions
		const conditions: ReturnType<typeof eq>[] = [];

		if (accountIds && accountIds.length > 0) {
			conditions.push(inArray(stalkerChannels.accountId, accountIds));
		}

		if (categoryIds && categoryIds.length > 0) {
			conditions.push(inArray(stalkerChannels.categoryId, categoryIds));
		}

		if (search && search.trim()) {
			conditions.push(like(stalkerChannels.name, `%${search.trim()}%`));
		}

		if (hasArchive !== undefined) {
			conditions.push(eq(stalkerChannels.tvArchive, hasArchive));
		}

		// Build order
		let orderColumn;
		switch (sortBy) {
			case 'number':
				orderColumn = stalkerChannels.number;
				break;
			case 'category':
				orderColumn = stalkerCategories.title;
				break;
			case 'name':
			default:
				orderColumn = stalkerChannels.name;
		}
		const orderDirection = sortOrder === 'desc' ? desc : asc;

		// Get total count
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const countResult = db
			.select({ count: sql<number>`count(*)` })
			.from(stalkerChannels)
			.leftJoin(stalkerCategories, eq(stalkerChannels.categoryId, stalkerCategories.id))
			.where(whereClause)
			.get();

		const total = countResult?.count ?? 0;

		// Get channels with joins
		const rows = db
			.select({
				id: stalkerChannels.id,
				accountId: stalkerChannels.accountId,
				stalkerId: stalkerChannels.stalkerId,
				name: stalkerChannels.name,
				number: stalkerChannels.number,
				logo: stalkerChannels.logo,
				categoryId: stalkerChannels.categoryId,
				stalkerGenreId: stalkerChannels.stalkerGenreId,
				cmd: stalkerChannels.cmd,
				tvArchive: stalkerChannels.tvArchive,
				archiveDuration: stalkerChannels.archiveDuration,
				createdAt: stalkerChannels.createdAt,
				updatedAt: stalkerChannels.updatedAt,
				categoryTitle: stalkerCategories.title,
				accountName: stalkerAccounts.name
			})
			.from(stalkerChannels)
			.leftJoin(stalkerCategories, eq(stalkerChannels.categoryId, stalkerCategories.id))
			.leftJoin(stalkerAccounts, eq(stalkerChannels.accountId, stalkerAccounts.id))
			.where(whereClause)
			.orderBy(orderDirection(orderColumn))
			.limit(effectivePageSize)
			.offset(offset)
			.all();

		const items: CachedChannel[] = rows.map((row) => ({
			id: row.id,
			accountId: row.accountId,
			stalkerId: row.stalkerId,
			name: row.name,
			number: row.number,
			logo: row.logo,
			categoryId: row.categoryId,
			categoryTitle: row.categoryTitle ?? null,
			stalkerGenreId: row.stalkerGenreId,
			cmd: row.cmd,
			tvArchive: row.tvArchive ?? false,
			archiveDuration: row.archiveDuration ?? 0,
			createdAt: row.createdAt ?? '',
			updatedAt: row.updatedAt ?? '',
			accountName: row.accountName ?? undefined
		}));

		return {
			items,
			total,
			page,
			pageSize: effectivePageSize,
			totalPages: Math.ceil(total / effectivePageSize)
		};
	}

	/**
	 * Get categories for filter dropdown
	 */
	async getCategories(accountIds?: string[]): Promise<CachedCategory[]> {
		const whereClause =
			accountIds && accountIds.length > 0
				? inArray(stalkerCategories.accountId, accountIds)
				: undefined;

		const rows = db
			.select({
				id: stalkerCategories.id,
				accountId: stalkerCategories.accountId,
				stalkerId: stalkerCategories.stalkerId,
				title: stalkerCategories.title,
				alias: stalkerCategories.alias,
				censored: stalkerCategories.censored,
				channelCount: stalkerCategories.channelCount,
				createdAt: stalkerCategories.createdAt,
				updatedAt: stalkerCategories.updatedAt,
				accountName: stalkerAccounts.name
			})
			.from(stalkerCategories)
			.leftJoin(stalkerAccounts, eq(stalkerCategories.accountId, stalkerAccounts.id))
			.where(whereClause)
			.orderBy(asc(stalkerCategories.title))
			.all();

		return rows.map((row) => ({
			id: row.id,
			accountId: row.accountId,
			stalkerId: row.stalkerId,
			title: row.title,
			alias: row.alias,
			censored: row.censored ?? false,
			channelCount: row.channelCount ?? 0,
			createdAt: row.createdAt ?? '',
			updatedAt: row.updatedAt ?? '',
			accountName: row.accountName ?? undefined
		}));
	}

	/**
	 * Get channel counts per account
	 */
	async getChannelCounts(): Promise<Map<string, number>> {
		const rows = db
			.select({
				accountId: stalkerChannels.accountId,
				count: sql<number>`count(*)`
			})
			.from(stalkerChannels)
			.groupBy(stalkerChannels.accountId)
			.all();

		const counts = new Map<string, number>();
		for (const row of rows) {
			counts.set(row.accountId, row.count);
		}

		return counts;
	}

	/**
	 * Get sync status for all accounts
	 */
	async getAccountSyncStatuses(): Promise<AccountSyncStatus[]> {
		const accounts = db.select().from(stalkerAccounts).all();

		return accounts.map((account) => ({
			id: account.id,
			name: account.name,
			syncStatus: (account.syncStatus as AccountSyncStatus['syncStatus']) ?? 'never',
			lastSyncAt: account.lastSyncAt,
			lastSyncError: account.lastSyncError,
			channelCount: account.channelCount,
			categoryCount: account.categoryCount
		}));
	}

	/**
	 * Get a single channel by ID
	 */
	async getChannel(id: string): Promise<CachedChannel | null> {
		const row = db
			.select({
				id: stalkerChannels.id,
				accountId: stalkerChannels.accountId,
				stalkerId: stalkerChannels.stalkerId,
				name: stalkerChannels.name,
				number: stalkerChannels.number,
				logo: stalkerChannels.logo,
				categoryId: stalkerChannels.categoryId,
				stalkerGenreId: stalkerChannels.stalkerGenreId,
				cmd: stalkerChannels.cmd,
				tvArchive: stalkerChannels.tvArchive,
				archiveDuration: stalkerChannels.archiveDuration,
				createdAt: stalkerChannels.createdAt,
				updatedAt: stalkerChannels.updatedAt,
				categoryTitle: stalkerCategories.title,
				accountName: stalkerAccounts.name
			})
			.from(stalkerChannels)
			.leftJoin(stalkerCategories, eq(stalkerChannels.categoryId, stalkerCategories.id))
			.leftJoin(stalkerAccounts, eq(stalkerChannels.accountId, stalkerAccounts.id))
			.where(eq(stalkerChannels.id, id))
			.get();

		if (!row) {
			return null;
		}

		return {
			id: row.id,
			accountId: row.accountId,
			stalkerId: row.stalkerId,
			name: row.name,
			number: row.number,
			logo: row.logo,
			categoryId: row.categoryId,
			categoryTitle: row.categoryTitle ?? null,
			stalkerGenreId: row.stalkerGenreId,
			cmd: row.cmd,
			tvArchive: row.tvArchive ?? false,
			archiveDuration: row.archiveDuration ?? 0,
			createdAt: row.createdAt ?? '',
			updatedAt: row.updatedAt ?? '',
			accountName: row.accountName ?? undefined
		};
	}
}

// Singleton instance
let channelServiceInstance: StalkerChannelService | null = null;

/**
 * Get the singleton StalkerChannelService instance
 */
export function getStalkerChannelService(): StalkerChannelService {
	if (!channelServiceInstance) {
		channelServiceInstance = new StalkerChannelService();
	}
	return channelServiceInstance;
}
