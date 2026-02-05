import type { RequestHandler } from './$types';
import { downloadMonitor } from '$lib/server/downloadClients/monitoring';
import { mediaResolver } from '$lib/server/activity';
import { extractReleaseGroup } from '$lib/server/indexers/parser/patterns/releaseGroup';
import type { UnifiedActivity, ActivityStatus } from '$lib/types/activity';

interface QueueItem {
	id: string;
	title: string;
	movieId?: string | null;
	seriesId?: string | null;
	episodeIds?: string[] | null;
	seasonNumber?: number | null;
	status: string;
	progress?: number;
	size?: number | null;
	indexerId?: string | null;
	indexerName?: string | null;
	protocol?: string | null;
	quality?: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
	addedAt: string;
	completedAt?: string | null;
	errorMessage?: string | null;
	isUpgrade?: boolean;
}

/**
 * Server-Sent Events endpoint for real-time activity updates
 *
 * Events emitted:
 * - activity:new - New activity started (download grabbed)
 * - activity:updated - Activity status/progress changed
 * - activity:completed - Activity completed (imported/failed)
 */
export const GET: RequestHandler = async ({ request }) => {
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send = (event: string, data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Connection closed
				}
			};

			// Send initial connection event
			send('connected', { timestamp: new Date().toISOString() });

			// Heartbeat to keep connection alive
			const heartbeatInterval = setInterval(() => {
				try {
					send('heartbeat', { timestamp: new Date().toISOString() });
				} catch {
					clearInterval(heartbeatInterval);
				}
			}, 30000);

			// Helper to convert queue item to activity using shared resolver
			const queueItemToActivity = async (item: QueueItem): Promise<Partial<UnifiedActivity>> => {
				const mediaInfo = await mediaResolver.resolveDownloadMediaInfo({
					movieId: item.movieId,
					seriesId: item.seriesId,
					episodeIds: item.episodeIds,
					seasonNumber: item.seasonNumber
				});

				// Map status
				let status: ActivityStatus = 'downloading';
				if (item.status === 'failed') status = 'failed';
				else if (item.status === 'imported') status = 'imported';
				else if (item.status === 'removed') status = 'removed';

				const releaseGroup = extractReleaseGroup(item.title);

				return {
					id: `queue-${item.id}`,
					mediaType: mediaInfo.mediaType,
					mediaId: mediaInfo.mediaId,
					mediaTitle: mediaInfo.mediaTitle,
					mediaYear: mediaInfo.mediaYear,
					seriesTitle: mediaInfo.seriesTitle,
					seasonNumber: mediaInfo.seasonNumber,
					episodeNumber: mediaInfo.episodeNumber,
					releaseTitle: item.title,
					quality: item.quality ?? null,
					releaseGroup: releaseGroup?.group ?? null,
					size: item.size ?? null,
					indexerId: item.indexerId ?? null,
					indexerName: item.indexerName ?? null,
					protocol: (item.protocol as 'torrent' | 'usenet' | 'streaming') ?? null,
					status,
					statusReason: item.errorMessage ?? undefined,
					downloadProgress: Math.round((item.progress ?? 0) * 100),
					isUpgrade: item.isUpgrade ?? false,
					startedAt: item.addedAt,
					completedAt: item.completedAt ?? null,
					queueItemId: item.id
				};
			};

			// Event handlers
			const onQueueAdded = async (item: unknown) => {
				try {
					const activity = await queueItemToActivity(item as QueueItem);
					send('activity:new', activity);
				} catch {
					// Error converting item
				}
			};

			const onQueueUpdated = async (item: unknown) => {
				try {
					const typedItem = item as QueueItem;
					// For progress updates, send minimal data
					send('activity:progress', {
						id: `queue-${typedItem.id}`,
						progress: Math.round((typedItem.progress ?? 0) * 100),
						status: typedItem.status
					});
				} catch {
					// Error
				}
			};

			const onQueueCompleted = async (item: unknown) => {
				try {
					const activity = await queueItemToActivity(item as QueueItem);
					send('activity:updated', { ...activity, status: 'downloading' });
				} catch {
					// Error
				}
			};

			const onQueueImported = async (data: unknown) => {
				try {
					const typedData = data as { queueItem: QueueItem };
					const activity = await queueItemToActivity(typedData.queueItem);
					send('activity:updated', { ...activity, status: 'imported' });
				} catch {
					// Error
				}
			};

			const onQueueFailed = async (data: unknown) => {
				try {
					const typedData = data as { queueItem: QueueItem; error: string };
					const activity = await queueItemToActivity(typedData.queueItem);
					send('activity:updated', {
						...activity,
						status: 'failed',
						statusReason: typedData.error
					});
				} catch {
					// Error
				}
			};

			// Register handlers
			downloadMonitor.on('queue:added', onQueueAdded);
			downloadMonitor.on('queue:updated', onQueueUpdated);
			downloadMonitor.on('queue:completed', onQueueCompleted);
			downloadMonitor.on('queue:imported', onQueueImported);
			downloadMonitor.on('queue:failed', onQueueFailed);

			// Cleanup on disconnect
			request.signal.addEventListener('abort', () => {
				clearInterval(heartbeatInterval);
				downloadMonitor.off('queue:added', onQueueAdded);
				downloadMonitor.off('queue:updated', onQueueUpdated);
				downloadMonitor.off('queue:completed', onQueueCompleted);
				downloadMonitor.off('queue:imported', onQueueImported);
				downloadMonitor.off('queue:failed', onQueueFailed);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
