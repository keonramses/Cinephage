/**
 * Channels with EPG API
 *
 * GET /api/livetv/channels/with-epg - Get channels that have EPG data available
 *
 * Used for the EPG source picker to allow users to select an alternative
 * channel's EPG data for channels that don't have their own EPG.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	stalkerChannels,
	stalkerAccounts,
	stalkerCategories,
	epgPrograms
} from '$lib/server/db/schema';
import { eq, like, sql, and, gt } from 'drizzle-orm';

interface ChannelWithEpgInfo {
	id: string;
	accountId: string;
	name: string;
	number: string | null;
	logo: string | null;
	categoryTitle: string | null;
	accountName: string;
	programCount: number;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const search = url.searchParams.get('search') || '';
		const page = parseInt(url.searchParams.get('page') || '1');
		const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50'), 100);
		const offset = (page - 1) * pageSize;

		// Query channels that have at least one EPG program
		// Use a subquery to count programs per channel
		const programCountSubquery = db
			.select({
				channelId: epgPrograms.channelId,
				count: sql<number>`count(*)`.as('program_count')
			})
			.from(epgPrograms)
			.groupBy(epgPrograms.channelId)
			.as('program_counts');

		// Build the query
		let query = db
			.select({
				id: stalkerChannels.id,
				accountId: stalkerChannels.accountId,
				name: stalkerChannels.name,
				number: stalkerChannels.number,
				logo: stalkerChannels.logo,
				categoryTitle: stalkerCategories.title,
				accountName: stalkerAccounts.name,
				programCount: programCountSubquery.count
			})
			.from(stalkerChannels)
			.innerJoin(programCountSubquery, eq(stalkerChannels.id, programCountSubquery.channelId))
			.innerJoin(stalkerAccounts, eq(stalkerChannels.accountId, stalkerAccounts.id))
			.leftJoin(stalkerCategories, eq(stalkerChannels.categoryId, stalkerCategories.id))
			.where(gt(programCountSubquery.count, 0))
			.orderBy(stalkerChannels.name)
			.limit(pageSize)
			.offset(offset);

		// Add search filter if provided
		if (search) {
			query = db
				.select({
					id: stalkerChannels.id,
					accountId: stalkerChannels.accountId,
					name: stalkerChannels.name,
					number: stalkerChannels.number,
					logo: stalkerChannels.logo,
					categoryTitle: stalkerCategories.title,
					accountName: stalkerAccounts.name,
					programCount: programCountSubquery.count
				})
				.from(stalkerChannels)
				.innerJoin(programCountSubquery, eq(stalkerChannels.id, programCountSubquery.channelId))
				.innerJoin(stalkerAccounts, eq(stalkerChannels.accountId, stalkerAccounts.id))
				.leftJoin(stalkerCategories, eq(stalkerChannels.categoryId, stalkerCategories.id))
				.where(and(gt(programCountSubquery.count, 0), like(stalkerChannels.name, `%${search}%`)))
				.orderBy(stalkerChannels.name)
				.limit(pageSize)
				.offset(offset);
		}

		const items = await query;

		// Get total count for pagination
		const countQuery = search
			? db
					.select({ count: sql<number>`count(distinct ${stalkerChannels.id})` })
					.from(stalkerChannels)
					.innerJoin(epgPrograms, eq(stalkerChannels.id, epgPrograms.channelId))
					.where(like(stalkerChannels.name, `%${search}%`))
			: db
					.select({ count: sql<number>`count(distinct ${stalkerChannels.id})` })
					.from(stalkerChannels)
					.innerJoin(epgPrograms, eq(stalkerChannels.id, epgPrograms.channelId));

		const [countResult] = await countQuery;
		const total = countResult?.count || 0;

		const response: ChannelWithEpgInfo[] = items.map((row) => ({
			id: row.id,
			accountId: row.accountId,
			name: row.name,
			number: row.number,
			logo: row.logo,
			categoryTitle: row.categoryTitle || null,
			accountName: row.accountName || 'Unknown Account',
			programCount: row.programCount || 0
		}));

		return json({
			items: response,
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize)
		});
	} catch (error) {
		console.error('[API] Failed to get channels with EPG:', error);
		return json({ error: 'Failed to get channels with EPG' }, { status: 500 });
	}
};
