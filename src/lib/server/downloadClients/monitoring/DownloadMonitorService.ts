/**
 * Download Monitor Service
 *
 * Polls download clients to track download progress, detect completions,
 * and trigger imports. Uses adaptive polling (faster when active downloads,
 * slower when idle).
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { downloadQueue } from '$lib/server/db/schema';
import { eq, and, inArray, not, notInArray } from 'drizzle-orm';
import { getDownloadClientManager } from '../DownloadClientManager';
import { mapClientPathToLocal } from './PathMapping';
import { extractInfoHash } from '../utils/hashUtils';
import { logger } from '$lib/logging';
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';
import type { IDownloadClient, DownloadInfo } from '../core/interfaces';
import type { DownloadClient } from '$lib/types/downloadClient';
import type { QueueStatus, QueueItem, QueueStats, QueueEvent } from '$lib/types/queue';

// Import service is loaded lazily to avoid circular dependencies
let importServiceInstance: import('../import').ImportService | null = null;
async function getImportService() {
	if (!importServiceInstance) {
		const { importService } = await import('../import');
		importServiceInstance = importService;
	}
	return importServiceInstance;
}

/**
 * Polling intervals in milliseconds
 */
const POLL_INTERVAL_ACTIVE = 5_000; // 5 seconds when active downloads
const POLL_INTERVAL_IDLE = 30_000; // 30 seconds when idle

/**
 * Terminal statuses that shouldn't be updated
 */
const TERMINAL_STATUSES: QueueStatus[] = ['imported', 'removed'];

/**
 * Convert database row to QueueItem
 */
function rowToQueueItem(row: typeof downloadQueue.$inferSelect): QueueItem {
	return {
		id: row.id,
		downloadClientId: row.downloadClientId,
		downloadId: row.downloadId,
		infoHash: row.infoHash,
		title: row.title,
		indexerId: row.indexerId,
		indexerName: row.indexerName,
		downloadUrl: row.downloadUrl,
		magnetUrl: row.magnetUrl,
		protocol: row.protocol,
		movieId: row.movieId,
		seriesId: row.seriesId,
		episodeIds: row.episodeIds as string[] | null,
		seasonNumber: row.seasonNumber,
		status: row.status as QueueStatus,
		progress: parseFloat(row.progress || '0'),
		size: row.size,
		downloadSpeed: row.downloadSpeed || 0,
		uploadSpeed: row.uploadSpeed || 0,
		eta: row.eta,
		ratio: parseFloat(row.ratio || '0'),
		clientDownloadPath: row.clientDownloadPath,
		outputPath: row.outputPath,
		importedPath: row.importedPath,
		quality: row.quality as QueueItem['quality'],
		addedAt: row.addedAt || new Date().toISOString(),
		startedAt: row.startedAt,
		completedAt: row.completedAt,
		importedAt: row.importedAt,
		errorMessage: row.errorMessage,
		importAttempts: row.importAttempts || 0,
		lastAttemptAt: row.lastAttemptAt,
		isAutomatic: !!row.isAutomatic,
		isUpgrade: !!row.isUpgrade
	};
}

/**
 * Map download client status to queue status
 */
function mapDownloadStatusToQueueStatus(
	downloadStatus: DownloadInfo['status'],
	progress: number
): QueueStatus {
	switch (downloadStatus) {
		case 'downloading':
			return 'downloading';
		case 'paused':
			return 'paused';
		case 'seeding':
			return progress >= 1 ? 'seeding' : 'downloading';
		case 'completed':
			return 'completed';
		case 'queued':
			return 'queued';
		case 'error':
			return 'failed';
		default:
			return 'queued';
	}
}

/**
 * Events emitted by DownloadMonitorService
 */
export interface DownloadMonitorEvents {
	/** Queue item added */
	'queue:added': (item: QueueItem) => void;
	/** Queue item updated */
	'queue:updated': (item: QueueItem) => void;
	/** Queue item removed */
	'queue:removed': (id: string) => void;
	/** Download completed (ready for import) */
	'queue:completed': (item: QueueItem) => void;
	/** Download imported */
	'queue:imported': (item: QueueItem) => void;
	/** Download failed */
	'queue:failed': (item: QueueItem) => void;
	/** Stats updated */
	'queue:stats': (stats: QueueStats) => void;
}

/**
 * Download Monitor Service
 *
 * Singleton service that continuously monitors download clients and updates
 * the download queue in the database. Implements BackgroundService for
 * lifecycle management via ServiceManager.
 */
export class DownloadMonitorService extends EventEmitter implements BackgroundService {
	private static instance: DownloadMonitorService | null = null;

	readonly name = 'DownloadMonitor';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	private isRunning = false;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private lastPollTime = 0;
	private activeDownloadCount = 0;

	// SSE clients for real-time updates
	private sseClients: Set<(event: QueueEvent) => void> = new Set();

	private constructor() {
		super();
	}

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	static getInstance(): DownloadMonitorService {
		if (!DownloadMonitorService.instance) {
			DownloadMonitorService.instance = new DownloadMonitorService();
		}
		return DownloadMonitorService.instance;
	}

	/** Reset the singleton instance (for testing) */
	static async resetInstance(): Promise<void> {
		if (DownloadMonitorService.instance) {
			await DownloadMonitorService.instance.stop();
			DownloadMonitorService.instance = null;
		}
	}

	/**
	 * Start the monitoring service (non-blocking)
	 * Implements BackgroundService.start()
	 */
	start(): void {
		if (this.isRunning || this._status === 'starting') {
			logger.debug('Download monitor already running');
			return;
		}

		this._status = 'starting';
		this.isRunning = true;
		logger.info('Starting download monitor service');

		// Perform async startup in background
		setImmediate(() => {
			this.performStartupSync()
				.then(() => {
					this._status = 'ready';
					this.schedulePoll(0); // Poll immediately on start
				})
				.catch((err) => {
					this._error = err instanceof Error ? err : new Error(String(err));
					this._status = 'error';
					logger.error('Download monitor startup failed', this._error);
				});
		});
	}

	/**
	 * Perform startup sync to reconcile orphaned downloads
	 *
	 * This checks all enabled download clients for downloads that exist in the client
	 * but are not tracked in our queue. These could be:
	 * - Downloads added manually
	 * - Downloads from before app was restarted
	 * - Downloads that failed to be tracked properly
	 *
	 * We log these orphans for visibility but don't auto-add them since we don't
	 * know which media they belong to.
	 */
	private async performStartupSync(): Promise<void> {
		logger.info('Performing startup sync to check for orphaned downloads');

		try {
			const manager = getDownloadClientManager();
			const enabledClients = await manager.getEnabledClients();

			if (enabledClients.length === 0) {
				logger.debug('No enabled download clients for startup sync');
				return;
			}

			// Get all active queue items (non-terminal)
			const activeQueueItems = await db
				.select()
				.from(downloadQueue)
				.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

			// Build sets of known download IDs and info hashes for quick lookup
			const knownDownloadIds = new Set<string>();
			const knownInfoHashes = new Set<string>();

			for (const item of activeQueueItems) {
				knownDownloadIds.add(item.downloadId.toLowerCase());
				if (item.infoHash) {
					knownInfoHashes.add(item.infoHash.toLowerCase());
				}
			}

			// Sync all clients in parallel with timeout for faster startup
			const SYNC_TIMEOUT_MS = 10_000; // 10 second timeout per client
			const syncResults = await Promise.all(
				enabledClients.map(async ({ client, instance }) => {
					try {
						// Race between client sync and timeout
						const downloads = await Promise.race([
							instance.getDownloads(),
							new Promise<never>((_, reject) =>
								setTimeout(() => reject(new Error('Sync timeout')), SYNC_TIMEOUT_MS)
							)
						]);

						const orphanedDownloads: DownloadInfo[] = [];

						for (const download of downloads) {
							const hashLower = download.hash.toLowerCase();

							// Check if we're already tracking this download
							const isTracked = knownDownloadIds.has(hashLower) || knownInfoHashes.has(hashLower);

							if (!isTracked) {
								// Check if it's in our category (if client supports categories)
								const isOurCategory =
									!client.tvCategory ||
									download.category === client.tvCategory ||
									download.category === client.movieCategory;

								if (isOurCategory) {
									orphanedDownloads.push(download);
								}
							}
						}

						if (orphanedDownloads.length > 0) {
							logger.warn('Found orphaned downloads in client not tracked by queue', {
								clientName: client.name,
								clientId: client.id,
								orphanCount: orphanedDownloads.length,
								orphans: orphanedDownloads.map((d) => ({
									name: d.name,
									hash: d.hash,
									status: d.status,
									progress: Math.round(d.progress * 100) + '%',
									category: d.category,
									savePath: d.savePath
								}))
							});

							// For completed orphans, we could attempt to identify and import them
							// For now, just log them so user is aware
							const completedOrphans = orphanedDownloads.filter(
								(d) => d.progress >= 1 && d.status !== 'error'
							);

							if (completedOrphans.length > 0) {
								logger.info(
									'Some orphaned downloads are completed and may be ready for manual import',
									{
										clientName: client.name,
										completedOrphans: completedOrphans.map((d) => ({
											name: d.name,
											hash: d.hash,
											savePath: d.savePath,
											contentPath: d.contentPath
										}))
									}
								);
							}
						} else {
							logger.debug('No orphaned downloads found in client', {
								clientName: client.name,
								totalDownloads: downloads.length,
								trackedCount: activeQueueItems.filter((q) => q.downloadClientId === client.id)
									.length
							});
						}

						return orphanedDownloads.length;
					} catch (error) {
						const isTimeout = error instanceof Error && error.message === 'Sync timeout';
						logger.warn(
							isTimeout
								? 'Download client sync timed out on startup'
								: 'Failed to sync with download client on startup',
							{
								clientName: client.name,
								clientId: client.id,
								error: error instanceof Error ? error.message : String(error)
							}
						);
						return 0;
					}
				})
			);

			const totalOrphans = syncResults.reduce((sum, count) => sum + count, 0);

			if (totalOrphans > 0) {
				logger.warn(
					`Startup sync complete: found ${totalOrphans} orphaned download(s) not tracked in queue`
				);
			} else {
				logger.info('Startup sync complete: all downloads are properly tracked');
			}
		} catch (error) {
			logger.error('Failed to perform startup sync', {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Clean up orphaned completed torrents that are not tracked in the queue.
	 * This removes torrents that have met their seeding requirements (canBeRemoved=true)
	 * but were never tracked by Cinephage (legacy/manual downloads).
	 *
	 * @param dryRun If true, only reports what would be removed without actually removing
	 * @returns Summary of removed/removable torrents
	 */
	async cleanupOrphanedDownloads(dryRun = false): Promise<{
		removed: { name: string; hash: string; ratio: number }[];
		skipped: { name: string; hash: string; reason: string }[];
		errors: { name: string; hash: string; error: string }[];
	}> {
		const result = {
			removed: [] as { name: string; hash: string; ratio: number }[],
			skipped: [] as { name: string; hash: string; reason: string }[],
			errors: [] as { name: string; hash: string; error: string }[]
		};

		logger.info('Starting orphaned download cleanup', { dryRun });

		try {
			const manager = getDownloadClientManager();
			const enabledClients = await manager.getEnabledClients();

			if (enabledClients.length === 0) {
				logger.info('No enabled download clients for orphan cleanup');
				return result;
			}

			// Get all tracked queue items
			const activeQueueItems = await db
				.select()
				.from(downloadQueue)
				.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

			const knownHashes = new Set<string>();
			for (const item of activeQueueItems) {
				knownHashes.add(item.downloadId.toLowerCase());
				if (item.infoHash) {
					knownHashes.add(item.infoHash.toLowerCase());
				}
			}

			for (const { client, instance } of enabledClients) {
				try {
					const downloads = await instance.getDownloads();

					for (const download of downloads) {
						const hashLower = download.hash.toLowerCase();

						// Skip if tracked
						if (knownHashes.has(hashLower)) {
							continue;
						}

						// Skip if not in our category
						const isOurCategory =
							!client.tvCategory ||
							download.category === client.tvCategory ||
							download.category === client.movieCategory;

						if (!isOurCategory) {
							continue;
						}

						// Check if it can be removed (completed + met seeding limits)
						if (!download.canBeRemoved) {
							result.skipped.push({
								name: download.name,
								hash: download.hash,
								reason:
									download.progress < 1
										? 'Still downloading'
										: 'Still seeding (limits not met or not paused)'
							});
							continue;
						}

						// This orphan can be removed
						if (dryRun) {
							result.removed.push({
								name: download.name,
								hash: download.hash,
								ratio: download.ratio || 0
							});
							logger.info('[DRY RUN] Would remove orphaned torrent', {
								name: download.name,
								hash: download.hash,
								ratio: download.ratio,
								seedingTime: download.seedingTime
							});
						} else {
							try {
								await instance.removeDownload(download.hash, false);
								result.removed.push({
									name: download.name,
									hash: download.hash,
									ratio: download.ratio || 0
								});
								logger.info('Removed orphaned torrent', {
									name: download.name,
									hash: download.hash,
									ratio: download.ratio,
									seedingTime: download.seedingTime
								});
							} catch (removeError) {
								result.errors.push({
									name: download.name,
									hash: download.hash,
									error: removeError instanceof Error ? removeError.message : String(removeError)
								});
							}
						}
					}
				} catch (error) {
					logger.error('Failed to process client for orphan cleanup', {
						clientName: client.name,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		} catch (error) {
			logger.error('Failed to cleanup orphaned downloads', {
				error: error instanceof Error ? error.message : String(error)
			});
		}

		logger.info('Orphaned download cleanup complete', {
			dryRun,
			removed: result.removed.length,
			skipped: result.skipped.length,
			errors: result.errors.length
		});

		return result;
	}

	/**
	 * Stop the monitoring service
	 * Implements BackgroundService.stop()
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) return;

		this.isRunning = false;
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		this._status = 'pending';
		logger.info('Stopped download monitor service');
	}

	/**
	 * Register an SSE client for real-time updates
	 */
	registerSSEClient(callback: (event: QueueEvent) => void): () => void {
		this.sseClients.add(callback);
		return () => this.sseClients.delete(callback);
	}

	/**
	 * Emit an event to SSE clients
	 */
	private emitSSE(type: QueueEvent['type'], data: QueueEvent['data']): void {
		const event: QueueEvent = {
			type,
			data,
			timestamp: new Date().toISOString()
		};

		for (const client of this.sseClients) {
			try {
				client(event);
			} catch (error) {
				logger.warn('Failed to send SSE event', { error });
			}
		}
	}

	/**
	 * Schedule the next poll
	 */
	private schedulePoll(delayMs?: number): void {
		if (!this.isRunning) return;

		const interval =
			delayMs ?? (this.activeDownloadCount > 0 ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE);

		this.pollTimer = setTimeout(() => this.poll(), interval);
	}

	/**
	 * Poll all download clients and update queue
	 */
	async poll(): Promise<void> {
		if (!this.isRunning) return;

		const startTime = Date.now();
		this.lastPollTime = startTime;

		try {
			await this.pollClients();
		} catch (error) {
			logger.error('Error during download poll', {
				error: error instanceof Error ? error.message : String(error)
			});
		}

		// Schedule next poll
		this.schedulePoll();
	}

	/**
	 * Force an immediate poll (useful after a grab)
	 */
	async forcePoll(): Promise<void> {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		await this.poll();
	}

	/**
	 * Poll all enabled download clients
	 */
	private async pollClients(): Promise<void> {
		const manager = getDownloadClientManager();
		const enabledClients = await manager.getEnabledClients();

		if (enabledClients.length === 0) {
			this.activeDownloadCount = 0;
			return;
		}

		// Get all non-terminal queue items grouped by client
		const queueItems = await db
			.select()
			.from(downloadQueue)
			.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

		// Group by client
		const itemsByClient = new Map<string, (typeof queueItems)[0][]>();
		for (const item of queueItems) {
			const existing = itemsByClient.get(item.downloadClientId) || [];
			existing.push(item);
			itemsByClient.set(item.downloadClientId, existing);
		}

		let totalActive = 0;

		// Poll each client
		for (const { client, instance } of enabledClients) {
			try {
				const clientItems = itemsByClient.get(client.id) || [];
				const activeCount = await this.pollClient(client, instance, clientItems);
				totalActive += activeCount;
			} catch (error) {
				logger.error('Failed to poll download client', {
					clientId: client.id,
					clientName: client.name,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		this.activeDownloadCount = totalActive;

		// Check for and remove completed downloads that have met seeding requirements
		// This follows Radarr's pattern of removing after seeding is done
		await this.removeCompletedDownloads(enabledClients);

		// Emit stats update
		const stats = await this.getStats();
		this.emitSSE('queue:stats', stats);
	}

	/**
	 * Remove completed downloads that have met their seeding requirements.
	 * Follows Radarr's RemoveCompletedDownloads pattern.
	 *
	 * This checks for queue items that are 'imported' and whose torrent
	 * has canBeRemoved=true (paused after reaching seed limits).
	 */
	private async removeCompletedDownloads(
		enabledClients: { client: DownloadClient; instance: IDownloadClient }[]
	): Promise<void> {
		// Get imported queue items that haven't been cleaned up yet
		// We look for 'imported' status items that still have a downloadId
		const importedItems = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.status, 'imported'));

		if (importedItems.length === 0) {
			return;
		}

		// Create a map of clients for quick lookup
		const clientMap = new Map<string, IDownloadClient>();
		for (const { client, instance } of enabledClients) {
			clientMap.set(client.id, instance);
		}

		for (const item of importedItems) {
			const clientInstance = clientMap.get(item.downloadClientId);
			if (!clientInstance) {
				continue;
			}

			try {
				// Check if the torrent still exists and can be removed
				const torrentHash = item.infoHash || item.downloadId;
				const download = await clientInstance.getDownload(torrentHash);

				if (!download) {
					// Torrent already removed from client, clean up queue entry
					logger.debug('Torrent already removed from client, cleaning up queue entry', {
						title: item.title,
						hash: torrentHash
					});
					await db.delete(downloadQueue).where(eq(downloadQueue.id, item.id));
					continue;
				}

				if (download.canBeRemoved) {
					// Torrent has met seeding requirements and is paused - remove it
					logger.info('Removing completed torrent from download client (seeding complete)', {
						title: item.title,
						hash: torrentHash,
						ratio: download.ratio,
						seedingTime: download.seedingTime,
						ratioLimit: download.ratioLimit,
						seedingTimeLimit: download.seedingTimeLimit
					});

					await clientInstance.removeDownload(torrentHash, false);

					// Clean up queue entry
					await db.delete(downloadQueue).where(eq(downloadQueue.id, item.id));

					logger.info('Successfully removed completed torrent', {
						title: item.title,
						hash: torrentHash
					});

					this.emitSSE('queue:removed', { id: item.id });
				} else {
					// Still seeding, leave it alone
					logger.debug('Imported torrent still seeding', {
						title: item.title,
						hash: torrentHash,
						ratio: download.ratio,
						status: download.status,
						canBeRemoved: download.canBeRemoved
					});
				}
			} catch (error) {
				logger.warn('Failed to check/remove completed torrent', {
					title: item.title,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	}

	/**
	 * Poll a single download client
	 */
	private async pollClient(
		client: DownloadClient,
		instance: IDownloadClient,
		queueItems: (typeof downloadQueue.$inferSelect)[]
	): Promise<number> {
		// Get all downloads from this client
		const downloads = await instance.getDownloads();

		// Create a map for quick lookup by download ID (hash)
		const downloadMap = new Map<string, DownloadInfo>();
		for (const dl of downloads) {
			downloadMap.set(dl.hash.toLowerCase(), dl);
		}

		let activeCount = 0;

		// Update each queue item
		for (const queueItem of queueItems) {
			// Try multiple strategies to find the download:
			// 1. By downloadId (primary)
			// 2. By stored infoHash
			// 3. By extracting hash from magnetUrl
			let download = downloadMap.get(queueItem.downloadId.toLowerCase());
			let matchedBy: 'downloadId' | 'infoHash' | 'magnetUrl' | null = download
				? 'downloadId'
				: null;

			// Fallback: try infoHash if stored
			if (!download && queueItem.infoHash) {
				download = downloadMap.get(queueItem.infoHash.toLowerCase());
				if (download) matchedBy = 'infoHash';
			}

			// Fallback: try extracting hash from magnetUrl
			if (!download && queueItem.magnetUrl) {
				const extractedHash = extractInfoHash(queueItem.magnetUrl);
				if (extractedHash) {
					download = downloadMap.get(extractedHash.toLowerCase());
					if (download) matchedBy = 'magnetUrl';
				}
			}

			if (download) {
				// If we matched by a fallback method, update downloadId for future lookups
				if (matchedBy && matchedBy !== 'downloadId') {
					logger.info('Updating downloadId from fallback match', {
						title: queueItem.title,
						oldDownloadId: queueItem.downloadId,
						newDownloadId: download.hash,
						matchedBy
					});
					await db
						.update(downloadQueue)
						.set({
							downloadId: download.hash,
							infoHash: queueItem.infoHash || download.hash
						})
						.where(eq(downloadQueue.id, queueItem.id));
					// Update local reference for the rest of this iteration
					queueItem.downloadId = download.hash;
				}

				// Download still exists in client
				const wasCompleted = queueItem.status === 'completed';
				const isNowDownloading = download.status === 'downloading';

				if (isNowDownloading || download.status === 'queued') {
					activeCount++;
				}

				await this.updateQueueItem(queueItem, download, client);

				// Check if just completed
				if (!wasCompleted && download.progress >= 1 && download.status !== 'error') {
					const updatedItem = await this.getQueueItem(queueItem.id);
					if (updatedItem) {
						this.emit('queue:completed', updatedItem);
						this.emitSSE('queue:completed', updatedItem);

						// Trigger import automatically
						this.triggerImport(updatedItem).catch((err) => {
							logger.error('Failed to trigger import for completed download', {
								queueId: updatedItem.id,
								title: updatedItem.title,
								error: err instanceof Error ? err.message : String(err)
							});
						});
					}
				}
			} else {
				// Download no longer exists in client
				// This could mean it was removed or finished seeding
				await this.handleMissingDownload(queueItem, client, downloads);
			}
		}

		return activeCount;
	}

	/**
	 * Update a queue item from download client data
	 */
	private async updateQueueItem(
		queueItem: typeof downloadQueue.$inferSelect,
		download: DownloadInfo,
		client: DownloadClient
	): Promise<void> {
		const now = new Date().toISOString();

		// Use contentPath (full path to torrent folder/file) for import
		// contentPath is the actual location of the downloaded files
		// savePath is just the parent directory
		const outputPath = mapClientPathToLocal(
			download.contentPath || download.savePath,
			client.downloadPathLocal,
			null // We could get client's default save path for more accurate mapping
		);

		// Determine new status
		const newStatus = mapDownloadStatusToQueueStatus(download.status, download.progress);

		// Check if this is meaningful change
		const oldProgress = parseFloat(queueItem.progress || '0');
		const progressChanged = Math.abs(download.progress - oldProgress) > 0.001;
		const statusChanged = queueItem.status !== newStatus;

		// Build update object
		const updates: Partial<typeof downloadQueue.$inferInsert> = {
			progress: download.progress.toString(),
			size: download.size,
			downloadSpeed: download.downloadSpeed,
			uploadSpeed: download.uploadSpeed,
			eta: download.eta,
			ratio: download.ratio?.toString() || '0',
			clientDownloadPath: download.savePath,
			outputPath
		};

		// Update status if changed
		if (statusChanged) {
			updates.status = newStatus;

			// Set startedAt on first download progress
			if (newStatus === 'downloading' && !queueItem.startedAt) {
				updates.startedAt = now;
			}

			// Set completedAt when finished downloading
			if (newStatus === 'completed' || newStatus === 'seeding') {
				if (!queueItem.completedAt) {
					updates.completedAt = now;
				}
			}
		}

		// Only update if something changed
		if (statusChanged || progressChanged) {
			await db.update(downloadQueue).set(updates).where(eq(downloadQueue.id, queueItem.id));

			// Emit update event
			const updatedItem = await this.getQueueItem(queueItem.id);
			if (updatedItem) {
				this.emit('queue:updated', updatedItem);
				this.emitSSE('queue:updated', updatedItem);
			}
		}
	}

	/**
	 * Handle a download that's no longer in the client
	 */
	private async handleMissingDownload(
		queueItem: typeof downloadQueue.$inferSelect,
		client: DownloadClient,
		allDownloads: DownloadInfo[]
	): Promise<void> {
		// If it was importing or already imported, don't change anything
		if (queueItem.status === 'importing' || queueItem.status === 'imported') {
			return;
		}

		// Grace period: don't mark as failed if added within last 30 seconds
		// This handles race conditions where qBittorrent hasn't finished processing the torrent yet
		const GRACE_PERIOD_MS = 30_000;
		const addedAt = queueItem.addedAt ? new Date(queueItem.addedAt).getTime() : 0;
		const timeSinceAdd = Date.now() - addedAt;

		if (timeSinceAdd < GRACE_PERIOD_MS && queueItem.status === 'queued') {
			logger.debug('Download not found but within grace period, skipping', {
				title: queueItem.title,
				timeSinceAdd,
				gracePeriod: GRACE_PERIOD_MS
			});
			return;
		}

		// If it was completed/seeding and is now gone, it was removed from client
		// (either manually or after seeding limits met)
		if (queueItem.status === 'completed' || queueItem.status === 'seeding') {
			logger.info('Download removed from client after completion', {
				title: queueItem.title,
				clientName: client.name
			});

			// Mark as removed - the import service should have already imported it
			await db
				.update(downloadQueue)
				.set({ status: 'removed' })
				.where(eq(downloadQueue.id, queueItem.id));

			const item = rowToQueueItem({ ...queueItem, status: 'removed' });
			this.emit('queue:removed', item.id);
			this.emitSSE('queue:removed', { id: item.id });
			return;
		}

		// If already failed, don't re-warn on every poll cycle
		// Just mark as removed so it stops being polled
		if (queueItem.status === 'failed') {
			logger.debug('Failed download no longer in client, marking as removed', {
				title: queueItem.title,
				downloadId: queueItem.downloadId
			});

			await db
				.update(downloadQueue)
				.set({ status: 'removed' })
				.where(eq(downloadQueue.id, queueItem.id));

			this.emit('queue:removed', queueItem.id);
			this.emitSSE('queue:removed', { id: queueItem.id });
			return;
		}

		// Log what downloads ARE available (for debugging)
		logger.warn('Download disappeared from client unexpectedly', {
			title: queueItem.title,
			clientName: client.name,
			previousStatus: queueItem.status,
			downloadId: queueItem.downloadId,
			infoHash: queueItem.infoHash,
			magnetUrl: queueItem.magnetUrl?.substring(0, 60),
			availableHashes: allDownloads.slice(0, 5).map((d) => d.hash)
		});

		await db
			.update(downloadQueue)
			.set({
				status: 'failed',
				errorMessage: 'Download removed from client unexpectedly'
			})
			.where(eq(downloadQueue.id, queueItem.id));

		const updatedItem = await this.getQueueItem(queueItem.id);
		if (updatedItem) {
			this.emit('queue:failed', updatedItem);
			this.emitSSE('queue:failed', updatedItem);
		}
	}

	/**
	 * Trigger import for a completed download
	 */
	private async triggerImport(queueItem: QueueItem): Promise<void> {
		// Don't import if already importing/imported
		if (queueItem.status === 'importing' || queueItem.status === 'imported') {
			return;
		}

		// Need output path to import
		if (!queueItem.outputPath) {
			logger.warn('Cannot import: no output path available', {
				queueId: queueItem.id,
				title: queueItem.title
			});
			return;
		}

		logger.info('Triggering import for completed download', {
			queueId: queueItem.id,
			title: queueItem.title,
			outputPath: queueItem.outputPath
		});

		try {
			const importService = await getImportService();
			const result = await importService.processImport(queueItem.id);

			if (result.success) {
				logger.info('Import completed successfully', {
					queueId: queueItem.id,
					title: queueItem.title,
					filesImported: result.importedFiles.length
				});
			} else {
				logger.error('Import failed', {
					queueId: queueItem.id,
					title: queueItem.title,
					error: result.error
				});
			}
		} catch (error) {
			logger.error('Import threw exception', {
				queueId: queueItem.id,
				title: queueItem.title,
				error: error instanceof Error ? error.message : String(error)
			});

			// Mark as failed
			await this.markFailed(
				queueItem.id,
				`Import error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Get a queue item by ID
	 */
	async getQueueItem(id: string): Promise<QueueItem | null> {
		const [row] = await db.select().from(downloadQueue).where(eq(downloadQueue.id, id)).limit(1);
		return row ? rowToQueueItem(row) : null;
	}

	/**
	 * Get all queue items (non-terminal)
	 */
	async getQueue(): Promise<QueueItem[]> {
		const rows = await db
			.select()
			.from(downloadQueue)
			.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

		return rows.map(rowToQueueItem);
	}

	/**
	 * Get queue statistics
	 */
	async getStats(): Promise<QueueStats> {
		const rows = await db
			.select()
			.from(downloadQueue)
			.where(not(inArray(downloadQueue.status, TERMINAL_STATUSES)));

		const stats: QueueStats = {
			totalCount: rows.length,
			downloadingCount: 0,
			seedingCount: 0,
			pausedCount: 0,
			completedCount: 0,
			failedCount: 0,
			totalSizeBytes: 0,
			totalDownloadSpeed: 0,
			totalUploadSpeed: 0
		};

		for (const row of rows) {
			stats.totalSizeBytes += row.size || 0;
			stats.totalDownloadSpeed += row.downloadSpeed || 0;
			stats.totalUploadSpeed += row.uploadSpeed || 0;

			switch (row.status) {
				case 'downloading':
					stats.downloadingCount++;
					break;
				case 'seeding':
					stats.seedingCount++;
					break;
				case 'paused':
					stats.pausedCount++;
					break;
				case 'completed':
					stats.completedCount++;
					break;
				case 'failed':
					stats.failedCount++;
					break;
			}
		}

		return stats;
	}

	/**
	 * Add a new item to the queue (called by grab endpoint)
	 */
	async addToQueue(params: {
		downloadClientId: string;
		downloadId: string;
		infoHash?: string;
		title: string;
		indexerId?: string;
		indexerName?: string;
		downloadUrl?: string;
		magnetUrl?: string;
		protocol?: string;
		movieId?: string;
		seriesId?: string;
		episodeIds?: string[];
		seasonNumber?: number;
		quality?: QueueItem['quality'];
		isAutomatic?: boolean;
		isUpgrade?: boolean;
	}): Promise<QueueItem> {
		// Check if download already in queue (prevent duplicates)
		// Only consider active downloads as duplicates - allow re-downloading removed/failed/imported items
		const existing = await db
			.select()
			.from(downloadQueue)
			.where(
				and(
					eq(downloadQueue.downloadClientId, params.downloadClientId),
					eq(downloadQueue.downloadId, params.downloadId),
					notInArray(downloadQueue.status, ['removed', 'failed', 'imported'])
				)
			)
			.limit(1);

		if (existing.length > 0) {
			// Return existing queue item instead of creating duplicate
			logger.info('Download already in queue, returning existing item', {
				downloadId: params.downloadId,
				existingId: existing[0].id,
				status: existing[0].status
			});
			return rowToQueueItem(existing[0]);
		}

		// Create new queue item
		const id = randomUUID();
		const now = new Date().toISOString();

		await db.insert(downloadQueue).values({
			id,
			downloadClientId: params.downloadClientId,
			downloadId: params.downloadId,
			infoHash: params.infoHash,
			title: params.title,
			indexerId: params.indexerId,
			indexerName: params.indexerName,
			downloadUrl: params.downloadUrl,
			magnetUrl: params.magnetUrl,
			protocol: params.protocol || 'torrent',
			movieId: params.movieId,
			seriesId: params.seriesId,
			episodeIds: params.episodeIds,
			seasonNumber: params.seasonNumber,
			status: 'queued',
			quality: params.quality,
			addedAt: now,
			isAutomatic: params.isAutomatic || false,
			isUpgrade: params.isUpgrade || false
		});

		const item = await this.getQueueItem(id);
		if (!item) {
			throw new Error('Failed to create queue item');
		}

		this.emit('queue:added', item);
		this.emitSSE('queue:added', item);

		// Force poll to pick up the new download
		setTimeout(() => this.forcePoll(), 1000);

		return item;
	}

	/**
	 * Remove an item from the queue and optionally from the client
	 */
	async removeFromQueue(
		id: string,
		options: {
			removeFromClient?: boolean;
			deleteFiles?: boolean;
		} = {}
	): Promise<void> {
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.limit(1);

		if (!queueItem) {
			throw new Error('Queue item not found');
		}

		// Remove from download client if requested
		if (options.removeFromClient) {
			const manager = getDownloadClientManager();
			const instance = await manager.getClientInstance(queueItem.downloadClientId);

			if (instance) {
				try {
					await instance.removeDownload(queueItem.downloadId, options.deleteFiles);
				} catch (error) {
					logger.warn('Failed to remove download from client', {
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}

		// Update status to removed
		await db.update(downloadQueue).set({ status: 'removed' }).where(eq(downloadQueue.id, id));

		this.emit('queue:removed', id);
		this.emitSSE('queue:removed', { id });
	}

	/**
	 * Pause a download
	 */
	async pauseDownload(id: string): Promise<void> {
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.limit(1);

		if (!queueItem) {
			throw new Error('Queue item not found');
		}

		const manager = getDownloadClientManager();
		const instance = await manager.getClientInstance(queueItem.downloadClientId);

		if (!instance) {
			throw new Error('Download client not available');
		}

		await instance.pauseDownload(queueItem.downloadId);

		// Update local status
		await db.update(downloadQueue).set({ status: 'paused' }).where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:updated', updatedItem);
			this.emitSSE('queue:updated', updatedItem);
		}
	}

	/**
	 * Resume a download
	 */
	async resumeDownload(id: string): Promise<void> {
		const [queueItem] = await db
			.select()
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.limit(1);

		if (!queueItem) {
			throw new Error('Queue item not found');
		}

		const manager = getDownloadClientManager();
		const instance = await manager.getClientInstance(queueItem.downloadClientId);

		if (!instance) {
			throw new Error('Download client not available');
		}

		await instance.resumeDownload(queueItem.downloadId);

		// Update local status
		await db.update(downloadQueue).set({ status: 'downloading' }).where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:updated', updatedItem);
			this.emitSSE('queue:updated', updatedItem);
		}
	}

	/**
	 * Mark a queue item as importing (for ImportService to call)
	 */
	async markImporting(id: string): Promise<void> {
		const now = new Date().toISOString();

		// First get current import attempts
		const current = await db
			.select({ importAttempts: downloadQueue.importAttempts })
			.from(downloadQueue)
			.where(eq(downloadQueue.id, id))
			.get();

		const newAttempts = (current?.importAttempts ?? 0) + 1;

		await db
			.update(downloadQueue)
			.set({
				status: 'importing',
				importAttempts: newAttempts,
				lastAttemptAt: now
			})
			.where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:updated', updatedItem);
			this.emitSSE('queue:updated', updatedItem);
		}
	}

	/**
	 * Mark a queue item as imported and remove from queue
	 */
	async markImported(id: string, importedPath: string): Promise<void> {
		const now = new Date().toISOString();

		// First update to imported status
		await db
			.update(downloadQueue)
			.set({
				status: 'imported',
				importedPath,
				importedAt: now
			})
			.where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:imported', updatedItem);
			this.emitSSE('queue:imported', updatedItem);
		}

		// Clean up the queue entry since history is preserved separately
		// Delete after a short delay to ensure SSE clients receive the imported event
		setTimeout(async () => {
			try {
				await db.delete(downloadQueue).where(eq(downloadQueue.id, id));
				logger.debug('Cleaned up imported queue item', { id });
			} catch (error) {
				logger.warn('Failed to clean up imported queue item', {
					id,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}, 2000);
	}

	/**
	 * Mark a queue item as failed
	 */
	async markFailed(id: string, errorMessage: string): Promise<void> {
		await db
			.update(downloadQueue)
			.set({
				status: 'failed',
				errorMessage
			})
			.where(eq(downloadQueue.id, id));

		const updatedItem = await this.getQueueItem(id);
		if (updatedItem) {
			this.emit('queue:failed', updatedItem);
			this.emitSSE('queue:failed', updatedItem);
		}
	}
}

// Singleton getter - preferred way to access the service
export function getDownloadMonitor(): DownloadMonitorService {
	return DownloadMonitorService.getInstance();
}

// Reset singleton (for testing)
export async function resetDownloadMonitor(): Promise<void> {
	await DownloadMonitorService.resetInstance();
}

// Backward-compatible export (prefer getDownloadMonitor())
export const downloadMonitor = DownloadMonitorService.getInstance();
