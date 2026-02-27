import { createSSEStream } from '$lib/server/sse';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { importService } from '$lib/server/downloadClients/import';
import { eventBuffer } from '$lib/server/sse/EventBuffer.js';
import { db } from '$lib/server/db';
import {
	series,
	seasons,
	episodes,
	episodeFiles,
	rootFolders,
	downloadQueue,
	subtitles
} from '$lib/server/db/schema';
import { eq, asc, inArray, and } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';
import { libraryMediaEvents } from '$lib/server/library/LibraryMediaEvents';
import { logger } from '$lib/logging';

const ACTIVE_DOWNLOAD_STATUSES = [
	'queued',
	'downloading',
	'stalled',
	'paused',
	'completed',
	'postprocessing',
	'importing',
	'seeding',
	'seeding-imported'
] as const;

// Local type definitions
interface EpisodeFileInfo {
	id: string;
	relativePath: string;
	size: number | null;
	dateAdded: string | null;
	sceneName: string | null;
	releaseGroup: string | null;
	releaseType: string | null;
	quality: {
		resolution?: string;
		source?: string;
		codec?: string;
		hdr?: string;
	} | null;
	mediaInfo: {
		containerFormat?: string;
		videoCodec?: string;
		videoProfile?: string;
		videoBitrate?: number;
		videoBitDepth?: number;
		videoHdrFormat?: string;
		width?: number;
		height?: number;
		audioCodec?: string;
		audioChannels?: number;
		audioLanguages?: string[];
		subtitleLanguages?: string[];
	} | null;
	languages: string[] | null;
}

interface SubtitleInfo {
	id: string;
	language: string;
	isForced?: boolean;
	isHearingImpaired?: boolean;
	format?: string;
}

interface SeasonWithEpisodes {
	id: string;
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
	airDate: string | null;
	monitored: boolean | null;
	episodeCount: number | null;
	episodeFileCount: number | null;
	episodes: Array<{
		id: string;
		tmdbId: number | null;
		tvdbId: number | null;
		seasonNumber: number;
		episodeNumber: number;
		absoluteEpisodeNumber: number | null;
		title: string | null;
		overview: string | null;
		airDate: string | null;
		runtime: number | null;
		monitored: boolean | null;
		hasFile: boolean | null;
		file: EpisodeFileInfo | null;
		subtitles?: SubtitleInfo[];
	}>;
}

interface QueueItem {
	id: string;
	title: string;
	status: string;
	progress?: string;
	episodeIds?: string[];
	seasonNumber?: number;
}

interface FileImportedEvent {
	mediaType: 'episode';
	seriesId: string;
	episodeIds: string[];
	seasonNumber: number;
	file: {
		id: string;
		relativePath: string;
		size: number;
		dateAdded: string;
		sceneName?: string;
		releaseGroup?: string;
		releaseType?: string;
		quality: EpisodeFileInfo['quality'];
		mediaInfo: EpisodeFileInfo['mediaInfo'];
		languages?: string[];
	};
	wasUpgrade: boolean;
	replacedFileIds?: string[];
}

interface FileDeletedEvent {
	mediaType: 'episode';
	seriesId: string;
	fileId: string;
	episodeIds: string[];
}

/**
 * Get series data with seasons and episodes for SSE initial state
 */
async function getSeriesData(seriesId: string) {
	const [seriesData] = await db
		.select({
			id: series.id,
			tmdbId: series.tmdbId,
			tvdbId: series.tvdbId,
			imdbId: series.imdbId,
			title: series.title,
			originalTitle: series.originalTitle,
			year: series.year,
			overview: series.overview,
			posterPath: series.posterPath,
			backdropPath: series.backdropPath,
			status: series.status,
			network: series.network,
			genres: series.genres,
			path: series.path,
			rootFolderId: series.rootFolderId,
			rootFolderPath: rootFolders.path,
			scoringProfileId: series.scoringProfileId,
			monitored: series.monitored,
			seasonFolder: series.seasonFolder,
			wantsSubtitles: series.wantsSubtitles,
			added: series.added,
			episodeCount: series.episodeCount,
			episodeFileCount: series.episodeFileCount
		})
		.from(series)
		.leftJoin(rootFolders, eq(series.rootFolderId, rootFolders.id))
		.where(eq(series.id, seriesId));

	if (!seriesData) return null;

	const percentComplete =
		seriesData.episodeCount && seriesData.episodeCount > 0
			? Math.round(((seriesData.episodeFileCount || 0) / seriesData.episodeCount) * 100)
			: 0;

	// Fetch all seasons
	const allSeasons = await db
		.select()
		.from(seasons)
		.where(eq(seasons.seriesId, seriesId))
		.orderBy(asc(seasons.seasonNumber));

	// Fetch all episodes
	const allEpisodes = await db
		.select()
		.from(episodes)
		.where(eq(episodes.seriesId, seriesId))
		.orderBy(asc(episodes.seasonNumber), asc(episodes.episodeNumber));

	// Fetch all episode files
	const allFiles = await db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, seriesId));

	// Create a map of episode ID to file
	const episodeIdToFile = new Map<string, EpisodeFileInfo>();
	for (const file of allFiles) {
		const episodeIds = file.episodeIds as string[] | null;
		if (episodeIds) {
			for (const epId of episodeIds) {
				episodeIdToFile.set(epId, {
					id: file.id,
					relativePath: file.relativePath,
					size: file.size,
					dateAdded: file.dateAdded,
					sceneName: file.sceneName,
					releaseGroup: file.releaseGroup,
					releaseType: file.releaseType,
					quality: file.quality as EpisodeFileInfo['quality'],
					mediaInfo: file.mediaInfo as EpisodeFileInfo['mediaInfo'],
					languages: file.languages as string[] | null
				});
			}
		}
	}

	// Fetch subtitles for all episodes
	const episodeIds = allEpisodes.map((ep) => ep.id);
	const allSubtitles =
		episodeIds.length > 0
			? await db
					.select({
						id: subtitles.id,
						episodeId: subtitles.episodeId,
						language: subtitles.language,
						isForced: subtitles.isForced,
						isHearingImpaired: subtitles.isHearingImpaired,
						format: subtitles.format
					})
					.from(subtitles)
					.where(inArray(subtitles.episodeId, episodeIds))
			: [];

	// Create a map of episode ID to subtitles
	const episodeIdToSubtitles = new Map<string, SubtitleInfo[]>();
	for (const sub of allSubtitles) {
		if (sub.episodeId) {
			const existing = episodeIdToSubtitles.get(sub.episodeId) || [];
			existing.push({
				id: sub.id,
				language: sub.language,
				isForced: sub.isForced ?? undefined,
				isHearingImpaired: sub.isHearingImpaired ?? undefined,
				format: sub.format ?? undefined
			});
			episodeIdToSubtitles.set(sub.episodeId, existing);
		}
	}

	// Build seasons with episodes
	const seasonsWithEpisodes: SeasonWithEpisodes[] = allSeasons.map((season) => {
		const seasonEpisodes = allEpisodes
			.filter((ep) => ep.seasonNumber === season.seasonNumber)
			.map((ep) => ({
				id: ep.id,
				tmdbId: ep.tmdbId,
				tvdbId: ep.tvdbId,
				seasonNumber: ep.seasonNumber,
				episodeNumber: ep.episodeNumber,
				absoluteEpisodeNumber: ep.absoluteEpisodeNumber,
				title: ep.title,
				overview: ep.overview,
				airDate: ep.airDate,
				runtime: ep.runtime,
				monitored: ep.monitored,
				hasFile: ep.hasFile,
				file: episodeIdToFile.get(ep.id) || null,
				subtitles: episodeIdToSubtitles.get(ep.id) || []
			}));

		return {
			id: season.id,
			seasonNumber: season.seasonNumber,
			name: season.name,
			overview: season.overview,
			posterPath: season.posterPath,
			airDate: season.airDate,
			monitored: season.monitored,
			episodeCount: season.episodeCount,
			episodeFileCount: season.episodeFileCount,
			episodes: seasonEpisodes
		};
	});

	return {
		series: {
			...seriesData,
			added: seriesData.added ?? new Date().toISOString(),
			percentComplete
		},
		seasons: seasonsWithEpisodes
	};
}

/**
 * Get active queue items for series
 */
async function getQueueItems(seriesId: string): Promise<QueueItem[]> {
	const results = await db
		.select({
			id: downloadQueue.id,
			title: downloadQueue.title,
			status: downloadQueue.status,
			progress: downloadQueue.progress,
			episodeIds: downloadQueue.episodeIds,
			seasonNumber: downloadQueue.seasonNumber
		})
		.from(downloadQueue)
		.where(
			and(
				eq(downloadQueue.seriesId, seriesId),
				inArray(downloadQueue.status, [...ACTIVE_DOWNLOAD_STATUSES])
			)
		);

	return results.map((q) => ({
		id: q.id,
		title: q.title,
		status: q.status ?? 'queued',
		progress: q.progress ?? undefined,
		episodeIds: q.episodeIds as string[] | undefined,
		seasonNumber: q.seasonNumber ?? undefined
	}));
}

/**
 * Server-Sent Events endpoint for real-time series detail updates
 *
 * Events emitted:
 * - media:initial - Full series state on connect
 * - queue:added - New download added for this series
 * - queue:updated - Queue item progress/status change
 * - file:added - New episode file imported
 * - file:removed - Episode file deleted
 * - episode:updated - Episode metadata changes
 */
export const GET: RequestHandler = async ({ params }) => {
	const seriesId = params.id;

	if (!seriesId) {
		return new Response('Series ID is required', { status: 400 });
	}

	return createSSEStream((send) => {
		// Concurrency control for sendInitialState to prevent race conditions
		// where multiple calls complete out of order and overwrite with stale data
		let isFetchingInitialState = false;
		let pendingVersion = 0;
		let lastSentVersion = 0;
		let initialStateFetchTime = 0;

		// Send initial state with version tracking
		const sendInitialState = async (version: number = Date.now()) => {
			// If already fetching, just mark that we need another refresh with this version
			if (isFetchingInitialState) {
				pendingVersion = Math.max(pendingVersion, version);
				logger.debug('[SeriesStream] Queuing refresh request', {
					seriesId,
					version,
					pendingVersion
				});
				return;
			}

			isFetchingInitialState = true;
			try {
				logger.info('[SeriesStream] Fetching initial state', { seriesId, version });
				const [data, queueItems] = await Promise.all([
					getSeriesData(seriesId),
					getQueueItems(seriesId)
				]);

				// Only send if this is still the latest request (not superseded by another)
				if (version >= lastSentVersion && data) {
					logger.info('[SeriesStream] Sending media:initial', {
						seriesId,
						version,
						episodeCount: data.seasons?.reduce((sum, s) => sum + (s.episodeFileCount || 0), 0)
					});
					send('media:initial', { ...data, queueItems });
					lastSentVersion = version;
				} else {
					logger.debug('[SeriesStream] Skipping stale media:initial', {
						seriesId,
						version,
						lastSentVersion
					});
				}
			} catch (error) {
				logger.error('[SeriesStream] Failed to fetch initial state', {
					seriesId,
					version,
					error: error instanceof Error ? error.message : String(error)
				});
			} finally {
				isFetchingInitialState = false;

				// If another request was queued during our execution, process it now
				if (pendingVersion > version) {
					logger.info('[SeriesStream] Processing queued refresh', { seriesId, pendingVersion });
					const nextVersion = pendingVersion;
					pendingVersion = 0;
					void sendInitialState(nextVersion);
				}
			}
		};

		// Send initial state and replay buffered events after connection is established
		void sendInitialState().then(() => {
			initialStateFetchTime = Date.now();

			// Replay recent buffered events (handles race condition where events fired before connection)
			// Only replay events that happened BEFORE we fetched initial state
			const recentEvents = eventBuffer.getRecentSeriesEvents(seriesId);
			logger.info('[SeriesStream] Replaying buffered events', {
				seriesId,
				count: recentEvents.length,
				bufferSize: recentEvents.length
			});
			for (const event of recentEvents) {
				// Skip events that happened after we started (they'll come through the live listener)
				if (event.timestamp > initialStateFetchTime) {
					logger.debug('[SeriesStream] Skipping future event in replay', {
						seriesId,
						episodeIds: event.episodeIds,
						timestamp: event.timestamp,
						fetchTime: initialStateFetchTime
					});
					continue;
				}
				logger.info('[SeriesStream] Replaying buffered event', {
					seriesId,
					seasonNumber: event.seasonNumber,
					episodeIds: event.episodeIds
				});
				send('file:added', {
					file: event.file,
					episodeIds: event.episodeIds,
					seasonNumber: event.seasonNumber,
					wasUpgrade: event.wasUpgrade,
					replacedFileIds: event.replacedFileIds
				});
			}
		});

		// Handle new queue items added for this series
		const onQueueAdded = (item: unknown) => {
			const typedItem = item as QueueItem & { seriesId?: string };
			if (typedItem.seriesId === seriesId) {
				logger.debug('[SeriesStream] Queue item added for series', {
					seriesId,
					queueItemId: typedItem.id
				});
				send('queue:added', {
					id: typedItem.id,
					title: typedItem.title,
					status: typedItem.status,
					progress: typedItem.progress ? parseFloat(typedItem.progress) : null,
					episodeIds: typedItem.episodeIds,
					seasonNumber: typedItem.seasonNumber
				});
			}
		};

		// Handle queue updates for this series
		const onQueueUpdated = (item: unknown) => {
			const typedItem = item as QueueItem & { seriesId?: string };
			if (typedItem.seriesId === seriesId) {
				send('queue:updated', {
					id: typedItem.id,
					title: typedItem.title,
					status: typedItem.status,
					progress: typedItem.progress ? parseFloat(typedItem.progress) : null,
					episodeIds: typedItem.episodeIds,
					seasonNumber: typedItem.seasonNumber
				});
			}
		};

		// Handle file imports for this series
		const onFileImported = (data: unknown) => {
			const typedData = data as FileImportedEvent;
			if (typedData.mediaType === 'episode' && typedData.seriesId === seriesId) {
				logger.info('[SeriesStream] File imported event received, sending to client', {
					seriesId,
					fileId: typedData.file.id,
					seasonNumber: typedData.seasonNumber,
					episodeIds: typedData.episodeIds,
					episodeCount: typedData.episodeIds?.length
				});
				send('file:added', {
					file: typedData.file,
					episodeIds: typedData.episodeIds,
					seasonNumber: typedData.seasonNumber,
					wasUpgrade: typedData.wasUpgrade,
					replacedFileIds: typedData.replacedFileIds
				});

				// If files were replaced, send deletion events
				if (typedData.replacedFileIds) {
					for (const replacedId of typedData.replacedFileIds) {
						logger.info('[SeriesStream] Sending replaced file removal event', {
							seriesId,
							replacedFileId: replacedId
						});
						send('file:removed', { fileId: replacedId });
					}
				}
			}
		};

		// Handle file deletions for this series
		const onFileDeleted = (data: unknown) => {
			const typedData = data as FileDeletedEvent;
			if (typedData.mediaType === 'episode' && typedData.seriesId === seriesId) {
				send('file:removed', {
					fileId: typedData.fileId,
					episodeIds: typedData.episodeIds
				});
			}
		};

		// Handle metadata/subtitle/settings updates for this series
		const onSeriesUpdated = (event: { seriesId: string }) => {
			if (event.seriesId === seriesId) {
				logger.info('[SeriesStream] Series update triggered, refreshing state', { seriesId });
				// Pass a new version to ensure this refresh takes precedence over any in-flight initial load
				void sendInitialState(Date.now());
			}
		};

		// Handle search status updates
		const onSeriesSearchStarted = (event: { seriesId: string }) => {
			if (event.seriesId === seriesId) {
				send('search:started', { seriesId });
			}
		};

		const onSeriesSearchCompleted = (event: { seriesId: string }) => {
			if (event.seriesId === seriesId) {
				send('search:completed', { seriesId });
			}
		};

		// Register handlers
		downloadMonitor.on('queue:added', onQueueAdded);
		downloadMonitor.on('queue:updated', onQueueUpdated);
		importService.on('file:imported', onFileImported);
		importService.on('file:deleted', onFileDeleted);
		libraryMediaEvents.onSeriesUpdated(onSeriesUpdated);
		libraryMediaEvents.onSeriesSearchStarted(onSeriesSearchStarted);
		libraryMediaEvents.onSeriesSearchCompleted(onSeriesSearchCompleted);

		// Return cleanup function
		return () => {
			downloadMonitor.off('queue:added', onQueueAdded);
			downloadMonitor.off('queue:updated', onQueueUpdated);
			importService.off('file:imported', onFileImported);
			importService.off('file:deleted', onFileDeleted);
			libraryMediaEvents.offSeriesUpdated(onSeriesUpdated);
			libraryMediaEvents.offSeriesSearchStarted(onSeriesSearchStarted);
			libraryMediaEvents.offSeriesSearchCompleted(onSeriesSearchCompleted);
		};
	});
};
