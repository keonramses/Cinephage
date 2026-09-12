/**
 * Radarr/Sonarr-compatible `command` (POST) response.
 *
 * Real Radarr/Sonarr commands are queued/async and cover ~30 different
 * command names, each hitting a different subsystem. Rather than build a
 * full command dispatcher, this maps every command name with a clear,
 * confident Cinephage equivalent to a real trigger (fired without blocking
 * the HTTP response - real commands are async too, clients poll for
 * completion via GET /command): missing-item search, cutoff-unmet search,
 * root-folder rescan, metadata refresh, rename execution, and blocklist
 * clearing. Anything else (including Backup - see the note by its case)
 * is accepted and reported as completed, so a client sending an unmapped
 * command name still gets a valid response rather than an error.
 *
 * Field set confirmed against CommandResource in Radarr/Sonarr's actual
 * openapi.json.
 */

import { createChildLogger } from '$lib/logging/index.js';
import { monitoringSearchService } from '$lib/server/monitoring/search/MonitoringSearchService.js';
import { diskScanService } from '$lib/server/library/disk-scan.js';
import {
	refreshMovieMetadata,
	refreshSeriesMetadata
} from '$lib/server/metadata/metadata-refresh.js';
import { RenamePreviewService } from '$lib/server/library/naming/RenamePreviewService.js';
import { db } from '$lib/server/db/index.js';
import { movies, series, blocklist } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { getEntityIdForArrId } from './ArrIdMappingService.js';
import type { ArrAppName } from './systemStatus.js';

const logger = createChildLogger({ module: 'ArrCompatCommand', logDomain: 'system' });

let nextCommandId = 1;

/** Fire a real trigger without blocking the HTTP response - matches how real command execution is async too. */
function fireAndForget(name: string, fn: () => Promise<unknown>): void {
	fn().catch((err) => {
		logger.warn({ err, command: name }, '[ArrCompatCommand] Background command failed');
	});
}

async function resolveRootFolderScan(appName: ArrAppName, arrId: number): Promise<void> {
	const entityId = await getEntityIdForArrId(appName === 'Radarr' ? 'movie' : 'series', arrId);
	if (!entityId) return;

	const row =
		appName === 'Radarr'
			? await db
					.select({ rootFolderId: movies.rootFolderId })
					.from(movies)
					.where(eq(movies.id, entityId))
					.get()
			: await db
					.select({ rootFolderId: series.rootFolderId })
					.from(series)
					.where(eq(series.id, entityId))
					.get();

	if (row?.rootFolderId) {
		await diskScanService.scanRootFolder(row.rootFolderId);
	}
}

async function renameEntity(appName: ArrAppName, arrId: number): Promise<void> {
	const entityId = await getEntityIdForArrId(appName === 'Radarr' ? 'movie' : 'series', arrId);
	if (!entityId) return;

	const service = new RenamePreviewService();
	const preview =
		appName === 'Radarr'
			? await service.previewMovie(entityId)
			: await service.previewSeries(entityId);
	const fileIds = preview.willChange.map((item) => item.fileId);
	if (fileIds.length === 0) return;

	await service.executeRenames(fileIds, appName === 'Radarr' ? 'movie' : 'episode');
}

export function handleCommand(
	appName: ArrAppName,
	body: Record<string, unknown>
): Record<string, unknown> {
	const name = (body.name as string) ?? '';
	const id = nextCommandId++;
	const now = new Date().toISOString();

	switch (name) {
		case 'MissingMoviesSearch':
		case 'MoviesSearch':
			fireAndForget(name, () => monitoringSearchService.searchMissingMovies());
			break;
		case 'MissingEpisodeSearch':
		case 'SeriesSearch':
		case 'EpisodeSearch':
			fireAndForget(name, () => monitoringSearchService.searchMissingEpisodes());
			break;
		case 'RescanMovie':
			if (typeof body.movieId === 'number') {
				fireAndForget(name, () => resolveRootFolderScan('Radarr', body.movieId as number));
			}
			break;
		case 'RescanSeries':
			if (typeof body.seriesId === 'number') {
				fireAndForget(name, () => resolveRootFolderScan('Sonarr', body.seriesId as number));
			}
			break;
		case 'RefreshMovie':
			if (typeof body.movieId === 'number') {
				fireAndForget(name, async () => {
					const entityId = await getEntityIdForArrId('movie', body.movieId as number);
					if (entityId) await refreshMovieMetadata(entityId);
				});
			}
			break;
		case 'RefreshSeries':
			if (typeof body.seriesId === 'number') {
				fireAndForget(name, async () => {
					const entityId = await getEntityIdForArrId('series', body.seriesId as number);
					if (entityId) await refreshSeriesMetadata(entityId);
				});
			}
			break;
		case 'CutOffUnmetMoviesSearch':
			fireAndForget(name, () =>
				monitoringSearchService.searchForUpgrades({ cutoffUnmetOnly: true })
			);
			break;
		case 'CutOffUnmetEpisodeSearch':
			fireAndForget(name, () =>
				monitoringSearchService.searchForUpgrades({ cutoffUnmetOnly: true })
			);
			break;
		case 'ClearBlocklist':
			fireAndForget(name, async () => {
				await db.delete(blocklist);
			});
			break;
		case 'RenameMovie':
			if (typeof body.movieId === 'number') {
				fireAndForget(name, () => renameEntity('Radarr', body.movieId as number));
			} else if (Array.isArray(body.movieIds)) {
				for (const movieId of body.movieIds) {
					if (typeof movieId === 'number')
						fireAndForget(name, () => renameEntity('Radarr', movieId));
				}
			}
			break;
		case 'RenameSeries':
			if (typeof body.seriesId === 'number') {
				fireAndForget(name, () => renameEntity('Sonarr', body.seriesId as number));
			} else if (Array.isArray(body.seriesIds)) {
				for (const seriesId of body.seriesIds) {
					if (typeof seriesId === 'number')
						fireAndForget(name, () => renameEntity('Sonarr', seriesId));
				}
			}
			break;
		// Backup is intentionally not mapped: Cinephage's backup mechanism
		// requires a user-supplied encryption passphrase (ConfigurationBackupService),
		// which isn't available to an automated command trigger - there's no
		// safe value to supply on the caller's behalf.
		default:
			// Unmapped command name - accept it, but there's nothing real to
			// trigger. Reported as completed rather than erroring the caller.
			break;
	}

	return {
		id,
		name,
		commandName: name,
		message: `Command ${name} accepted`,
		priority: 'normal',
		status: 'completed',
		queued: now,
		started: now,
		ended: now,
		trigger: 'manual',
		sendUpdatesToClient: false,
		updateScheduledTask: false
	};
}

/** GET /command - no real command-history tracking exists yet, so this is an empty list. */
export function listCommands(): Record<string, unknown>[] {
	return [];
}
