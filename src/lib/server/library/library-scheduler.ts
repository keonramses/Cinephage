/**
 * Library Scheduler Service
 *
 * Manages periodic library scans and coordinates startup initialization.
 * Provides centralized control over library scanning operations.
 */

import { db } from '$lib/server/db/index.js';
import { librarySettings, libraryScanHistory } from '$lib/server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { diskScanService, type ScanResult } from './disk-scan.js';
import { mediaMatcherService } from './media-matcher.js';
import { libraryWatcherService } from './library-watcher.js';
import { EventEmitter } from 'events';
import { logger } from '$lib/logging';
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';

/**
 * Default scan interval in hours
 */
const DEFAULT_SCAN_INTERVAL_HOURS = 12;

/**
 * Minimum scan interval in hours
 */
const MIN_SCAN_INTERVAL_HOURS = 1;

/**
 * LibrarySchedulerService - Coordinate library scanning operations
 *
 * Implements BackgroundService for lifecycle management via ServiceManager.
 */
export class LibrarySchedulerService extends EventEmitter implements BackgroundService {
	private static instance: LibrarySchedulerService | null = null;

	readonly name = 'LibraryScheduler';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	private scanInterval: NodeJS.Timeout | null = null;
	private isInitialized = false;
	private lastScanTime: Date | null = null;

	private constructor() {
		super();
	}

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	static getInstance(): LibrarySchedulerService {
		if (!LibrarySchedulerService.instance) {
			LibrarySchedulerService.instance = new LibrarySchedulerService();
		}
		return LibrarySchedulerService.instance;
	}

	/** Reset the singleton instance (for testing) */
	static async resetInstance(): Promise<void> {
		if (LibrarySchedulerService.instance) {
			await LibrarySchedulerService.instance.stop();
			LibrarySchedulerService.instance = null;
		}
	}

	/**
	 * Get configured scan interval in hours
	 */
	private async getScanIntervalHours(): Promise<number> {
		const setting = await db
			.select()
			.from(librarySettings)
			.where(eq(librarySettings.key, 'scan_interval_hours'))
			.limit(1);

		if (setting.length > 0) {
			const hours = parseInt(setting[0].value);
			if (!isNaN(hours) && hours >= MIN_SCAN_INTERVAL_HOURS) {
				return hours;
			}
		}

		return DEFAULT_SCAN_INTERVAL_HOURS;
	}

	/**
	 * Check if scan on startup is enabled
	 */
	private async shouldScanOnStartup(): Promise<boolean> {
		const setting = await db
			.select()
			.from(librarySettings)
			.where(eq(librarySettings.key, 'scan_on_startup'))
			.limit(1);

		if (setting.length > 0) {
			return setting[0].value === 'true';
		}

		// Default to true
		return true;
	}

	/**
	 * Start the scheduler (non-blocking)
	 * Implements BackgroundService.start()
	 */
	start(): void {
		if (this.isInitialized || this._status === 'starting') {
			logger.debug('[LibraryScheduler] Already initialized or starting');
			return;
		}

		this._status = 'starting';
		logger.info('[LibraryScheduler] Starting...');

		// Run initialization in background
		setImmediate(() => {
			this.initialize()
				.then(() => {
					this._status = 'ready';
				})
				.catch((err) => {
					this._error = err instanceof Error ? err : new Error(String(err));
					this._status = 'error';
					logger.error('[LibraryScheduler] Failed to initialize', this._error);
				});
		});
	}

	/**
	 * Initialize the scheduler and start background operations
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			logger.debug('[LibraryScheduler] Already initialized');
			return;
		}

		logger.info('[LibraryScheduler] Initializing...');

		// Add error listener to prevent unhandled error crashes
		libraryWatcherService.on('error', (data) => {
			logger.error('[LibraryScheduler] LibraryWatcher error', undefined, { data });
			// Emit to scheduler's own events for monitoring
			this.emit('watcherError', data);
		});

		// Initialize the filesystem watcher in background (don't block startup)
		libraryWatcherService.initialize().catch((error) => {
			logger.error('[LibraryScheduler] Failed to initialize filesystem watcher', error);
		});

		// Set up periodic scans (doesn't need watcher to be ready)
		await this.setupPeriodicScans();

		// Check if we should scan on startup
		const scanOnStartup = await this.shouldScanOnStartup();
		if (scanOnStartup) {
			// Check when the last scan was
			const lastScan = await this.getLastScanTime();
			const hoursSinceLastScan = lastScan
				? (Date.now() - lastScan.getTime()) / (1000 * 60 * 60)
				: Infinity;

			const scanInterval = await this.getScanIntervalHours();

			// Only scan if it's been longer than the scan interval
			if (hoursSinceLastScan >= scanInterval) {
				logger.info('[LibraryScheduler] Starting startup scan...');
				// Run scan in background (don't await)
				this.runFullScan().catch((error) => {
					logger.error('[LibraryScheduler] Startup scan failed', error);
				});
			} else {
				logger.debug('[LibraryScheduler] Skipping startup scan', {
					hoursSinceLastScan: hoursSinceLastScan.toFixed(1)
				});
			}
		}

		this.isInitialized = true;
		logger.info('[LibraryScheduler] Initialized');
	}

	/**
	 * Stop the scheduler
	 * Implements BackgroundService.stop()
	 */
	async stop(): Promise<void> {
		logger.info('[LibraryScheduler] Stopping...');

		// Stop periodic scans
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
			this.scanInterval = null;
		}

		// Stop filesystem watcher
		await libraryWatcherService.shutdown();

		this.isInitialized = false;
		this._status = 'pending';
		logger.info('[LibraryScheduler] Stopped');
	}

	/**
	 * Shutdown the scheduler (alias for stop, backward compatibility)
	 */
	async shutdown(): Promise<void> {
		return this.stop();
	}

	/**
	 * Set up periodic scan interval
	 */
	private async setupPeriodicScans(): Promise<void> {
		// Clear existing interval
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
		}

		const intervalHours = await this.getScanIntervalHours();
		const intervalMs = intervalHours * 60 * 60 * 1000;

		logger.info('[LibraryScheduler] Setting up periodic scans', { intervalHours });

		this.scanInterval = setInterval(async () => {
			logger.info('[LibraryScheduler] Running scheduled scan...');
			try {
				await this.runFullScan();
			} catch (error) {
				logger.error('[LibraryScheduler] Scheduled scan failed', error);
			}
		}, intervalMs);
	}

	/**
	 * Run a full scan of all root folders
	 */
	async runFullScan(): Promise<ScanResult[]> {
		if (diskScanService.scanning) {
			logger.debug('[LibraryScheduler] Scan already in progress');
			return [];
		}

		this.emit('scanStart', { type: 'full' });

		try {
			// Scan all root folders
			const results = await diskScanService.scanAll();
			this.lastScanTime = new Date();

			// Process unmatched files
			logger.info('[LibraryScheduler] Processing unmatched files...');
			await mediaMatcherService.processAllUnmatched();

			this.emit('scanComplete', { type: 'full', results });
			return results;
		} catch (error) {
			this.emit('scanError', { type: 'full', error });
			throw error;
		}
	}

	/**
	 * Run a scan for a specific root folder
	 */
	async runFolderScan(rootFolderId: string): Promise<ScanResult> {
		if (diskScanService.scanning) {
			throw new Error('A scan is already in progress');
		}

		this.emit('scanStart', { type: 'folder', rootFolderId });

		try {
			const result = await diskScanService.scanRootFolder(rootFolderId);
			this.lastScanTime = new Date();

			// Process unmatched files
			await mediaMatcherService.processAllUnmatched();

			this.emit('scanComplete', { type: 'folder', rootFolderId, result });
			return result;
		} catch (error) {
			this.emit('scanError', { type: 'folder', rootFolderId, error });
			throw error;
		}
	}

	/**
	 * Get the last scan time from database
	 */
	private async getLastScanTime(): Promise<Date | null> {
		const lastScan = await db
			.select({ completedAt: libraryScanHistory.completedAt })
			.from(libraryScanHistory)
			.where(eq(libraryScanHistory.status, 'completed'))
			.orderBy(desc(libraryScanHistory.completedAt))
			.limit(1);

		if (lastScan.length > 0 && lastScan[0].completedAt) {
			return new Date(lastScan[0].completedAt);
		}

		return null;
	}

	/**
	 * Get scheduler status
	 */
	async getStatus(): Promise<{
		initialized: boolean;
		scanning: boolean;
		currentScanId: string | null;
		lastScanTime: Date | null;
		nextScanTime: Date | null;
		scanIntervalHours: number;
		watcherStatus: { enabled: boolean; watchedFolders: string[] };
	}> {
		const intervalHours = await this.getScanIntervalHours();
		const lastScan = this.lastScanTime || (await this.getLastScanTime());

		let nextScanTime: Date | null = null;
		if (lastScan && this.scanInterval) {
			nextScanTime = new Date(lastScan.getTime() + intervalHours * 60 * 60 * 1000);
		}

		return {
			initialized: this.isInitialized,
			scanning: diskScanService.scanning,
			currentScanId: diskScanService.activeScanId,
			lastScanTime: lastScan,
			nextScanTime,
			scanIntervalHours: intervalHours,
			watcherStatus: libraryWatcherService.getStatus()
		};
	}

	/**
	 * Update scan interval (requires restart of periodic scans)
	 */
	async setScanInterval(hours: number): Promise<void> {
		if (hours < MIN_SCAN_INTERVAL_HOURS) {
			throw new Error(`Scan interval must be at least ${MIN_SCAN_INTERVAL_HOURS} hour(s)`);
		}

		await db
			.insert(librarySettings)
			.values({ key: 'scan_interval_hours', value: hours.toString() })
			.onConflictDoUpdate({
				target: librarySettings.key,
				set: { value: hours.toString() }
			});

		// Restart periodic scans with new interval
		await this.setupPeriodicScans();
	}

	/**
	 * Enable or disable filesystem watching
	 */
	async setWatchEnabled(enabled: boolean): Promise<void> {
		await db
			.insert(librarySettings)
			.values({ key: 'watch_enabled', value: enabled.toString() })
			.onConflictDoUpdate({
				target: librarySettings.key,
				set: { value: enabled.toString() }
			});

		// Apply change immediately
		if (enabled) {
			await libraryWatcherService.initialize();
		} else {
			await libraryWatcherService.shutdown();
		}
	}

	/**
	 * Set auto-match threshold
	 */
	async setMatchThreshold(threshold: number): Promise<void> {
		if (threshold < 0 || threshold > 1) {
			throw new Error('Match threshold must be between 0 and 1');
		}

		await db
			.insert(librarySettings)
			.values({ key: 'auto_match_threshold', value: threshold.toString() })
			.onConflictDoUpdate({
				target: librarySettings.key,
				set: { value: threshold.toString() }
			});
	}

	/**
	 * Enable or disable scan on startup
	 */
	async setScanOnStartup(enabled: boolean): Promise<void> {
		await db
			.insert(librarySettings)
			.values({ key: 'scan_on_startup', value: enabled.toString() })
			.onConflictDoUpdate({
				target: librarySettings.key,
				set: { value: enabled.toString() }
			});
	}
}

// Singleton getter - preferred way to access the service
export function getLibraryScheduler(): LibrarySchedulerService {
	return LibrarySchedulerService.getInstance();
}

// Reset singleton (for testing)
export async function resetLibraryScheduler(): Promise<void> {
	await LibrarySchedulerService.resetInstance();
}

// Backward-compatible export (prefer getLibraryScheduler())
export const librarySchedulerService = LibrarySchedulerService.getInstance();
