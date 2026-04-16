import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	mediaServerSyncedItems,
	mediaServerSyncedRuns,
	mediaBrowserServers
} from '$lib/server/db/schema';
import { sql, desc } from 'drizzle-orm';
import type {
	StatsSummary,
	AggregatedMediaItem,
	ServerSyncStatus
} from '$lib/server/mediaServerStats/types.js';

function bucketResolution(height: number | null): string {
	if (!height) return 'Unknown';
	if (height >= 2160) return '4K';
	if (height >= 1080) return '1080p';
	if (height >= 720) return '720p';
	if (height >= 480) return '480p';
	return 'SD';
}

function aggregateItems(
	rows: (typeof mediaServerSyncedItems.$inferSelect)[]
): AggregatedMediaItem[] {
	const map = new Map<string, AggregatedMediaItem>();

	for (const row of rows) {
		const key = `${row.tmdbId ?? 'null'}-${row.tvdbId ?? 'null'}-${row.title}`;
		const existing = map.get(key);
		if (existing) {
			existing.totalPlayCount += row.playCount ?? 0;
			if (
				row.lastPlayedDate &&
				(!existing.lastPlayedDate || row.lastPlayedDate > existing.lastPlayedDate)
			) {
				existing.lastPlayedDate = row.lastPlayedDate;
			}
			if (row.serverId) {
				existing.serverBreakdown.push({
					serverId: row.serverId,
					serverName: '',
					serverType: 'jellyfin',
					playCount: row.playCount ?? 0,
					lastPlayedDate: row.lastPlayedDate ?? null,
					videoCodec: row.videoCodec ?? null,
					width: row.width ?? null,
					height: row.height ?? null,
					isHDR: (row.isHDR ?? 0) === 1,
					containerFormat: row.containerFormat ?? null
				});
			}
		} else {
			map.set(key, {
				tmdbId: row.tmdbId ?? null,
				tvdbId: row.tvdbId ?? null,
				imdbId: row.imdbId ?? null,
				title: row.title,
				year: row.year ?? null,
				itemType: row.itemType,
				totalPlayCount: row.playCount ?? 0,
				lastPlayedDate: row.lastPlayedDate ?? null,
				serverBreakdown: row.serverId
					? [
							{
								serverId: row.serverId,
								serverName: '',
								serverType: 'jellyfin',
								playCount: row.playCount ?? 0,
								lastPlayedDate: row.lastPlayedDate ?? null,
								videoCodec: row.videoCodec ?? null,
								width: row.width ?? null,
								height: row.height ?? null,
								isHDR: (row.isHDR ?? 0) === 1,
								containerFormat: row.containerFormat ?? null
							}
						]
					: []
			});
		}
	}

	return Array.from(map.values());
}

export const GET: RequestHandler = async () => {
	const [
		totalPlaysRow,
		uniqueItemsRow,
		serversSyncedRow,
		totalFileSizeRow,
		allItems,
		codecRows,
		hdrRows,
		audioCodecRows,
		containerRows,
		servers,
		syncRuns
	] = await Promise.all([
		db
			.select({ total: sql<number>`coalesce(sum(${mediaServerSyncedItems.playCount}), 0)` })
			.from(mediaServerSyncedItems),
		db
			.select({
				count: sql<number>`count(distinct coalesce(${mediaServerSyncedItems.tmdbId}, ${mediaServerSyncedItems.serverItemId}))`
			})
			.from(mediaServerSyncedItems),
		db
			.select({
				count: sql<number>`count(distinct ${mediaServerSyncedItems.serverId})`
			})
			.from(mediaServerSyncedItems),
		db
			.select({ total: sql<number>`coalesce(sum(${mediaServerSyncedItems.fileSize}), 0)` })
			.from(mediaServerSyncedItems),
		db.select().from(mediaServerSyncedItems),
		db
			.select({
				videoCodec: mediaServerSyncedItems.videoCodec,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.videoCodec} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.videoCodec)
			.orderBy(sql`count(*) desc`),
		db
			.select({
				isHDR: mediaServerSyncedItems.isHDR,
				hdrFormat: mediaServerSyncedItems.hdrFormat,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.groupBy(mediaServerSyncedItems.isHDR, mediaServerSyncedItems.hdrFormat)
			.orderBy(sql`count(*) desc`),
		db
			.select({
				audioCodec: mediaServerSyncedItems.audioCodec,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.audioCodec} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.audioCodec)
			.orderBy(sql`count(*) desc`),
		db
			.select({
				containerFormat: mediaServerSyncedItems.containerFormat,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.containerFormat} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.containerFormat)
			.orderBy(sql`count(*) desc`),
		db.select().from(mediaBrowserServers),
		db.select().from(mediaServerSyncedRuns).orderBy(desc(mediaServerSyncedRuns.startedAt))
	]);

	const resolutionMap = new Map<string, number>();
	for (const item of allItems) {
		const label = bucketResolution(item.height);
		resolutionMap.set(label, (resolutionMap.get(label) ?? 0) + 1);
	}
	const resolutionBreakdown = Array.from(resolutionMap.entries())
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count);

	const codecBreakdown = codecRows.map((r) => ({
		label: r.videoCodec ?? 'Unknown',
		count: r.count
	}));

	const hdrBreakdown = hdrRows.map((r) => {
		const isHdr = (r.isHDR ?? 0) === 1;
		return {
			label: isHdr ? (r.hdrFormat ?? 'HDR') : 'SDR',
			count: r.count
		};
	});

	const audioCodecBreakdown = audioCodecRows.map((r) => ({
		label: r.audioCodec ?? 'Unknown',
		count: r.count
	}));

	const containerBreakdown = containerRows.map((r) => ({
		label: r.containerFormat ?? 'Unknown',
		count: r.count
	}));

	const aggregated = aggregateItems(allItems);
	const topPlayedItems = aggregated
		.sort((a, b) => b.totalPlayCount - a.totalPlayCount)
		.slice(0, 25);

	const largestItems = allItems
		.filter((item) => item.fileSize != null)
		.sort((a, b) => (b.fileSize ?? 0) - (a.fileSize ?? 0))
		.slice(0, 10)
		.map((item) => {
			const agg = aggregated.find(
				(a) => a.tmdbId === item.tmdbId && a.tvdbId === item.tvdbId && a.title === item.title
			);
			return (
				agg ?? {
					tmdbId: item.tmdbId ?? null,
					tvdbId: item.tvdbId ?? null,
					imdbId: item.imdbId ?? null,
					title: item.title,
					year: item.year ?? null,
					itemType: item.itemType,
					totalPlayCount: item.playCount ?? 0,
					lastPlayedDate: item.lastPlayedDate ?? null,
					serverBreakdown: []
				}
			);
		});

	const latestRunsMap = new Map<string, (typeof syncRuns)[0]>();
	for (const run of syncRuns) {
		if (!latestRunsMap.has(run.serverId)) {
			latestRunsMap.set(run.serverId, run);
		}
	}

	const itemCountsMap = new Map<string, number>();
	for (const item of allItems) {
		if (item.serverId) {
			itemCountsMap.set(item.serverId, (itemCountsMap.get(item.serverId) ?? 0) + 1);
		}
	}

	const serverStatuses: ServerSyncStatus[] = servers.map((server) => {
		const latestRun = latestRunsMap.get(server.id);
		return {
			serverId: server.id,
			serverName: server.name,
			serverType: server.serverType,
			itemCount: itemCountsMap.get(server.id) ?? 0,
			lastSyncAt: latestRun?.completedAt ?? latestRun?.startedAt ?? null,
			lastSyncStatus: latestRun?.status ?? null,
			enabled: server.enabled ?? true
		};
	});

	const summary: StatsSummary & { serverStatuses: ServerSyncStatus[] } = {
		totalPlays: totalPlaysRow[0]?.total ?? 0,
		uniqueItems: uniqueItemsRow[0]?.count ?? 0,
		serversSynced: serversSyncedRow[0]?.count ?? 0,
		totalFileSize: totalFileSizeRow[0]?.total ?? 0,
		resolutionBreakdown,
		codecBreakdown,
		hdrBreakdown,
		audioCodecBreakdown,
		containerBreakdown,
		topPlayedItems,
		largestItems,
		serverStatuses
	};

	return json(summary);
};
