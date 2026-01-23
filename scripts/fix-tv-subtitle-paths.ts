import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { db } from '../src/lib/server/db';
import {
	episodes,
	episodeFiles,
	rootFolders,
	series,
	subtitles
} from '../src/lib/server/db/schema';
import { eq, isNotNull } from 'drizzle-orm';

type EpisodeRow = typeof episodes.$inferSelect;
type SeriesRow = typeof series.$inferSelect;
type RootFolderRow = typeof rootFolders.$inferSelect;
type EpisodeFileRow = typeof episodeFiles.$inferSelect;
type SubtitleRow = typeof subtitles.$inferSelect;

function resolveEpisodeMediaDir(
	rootPath: string,
	seriesPath: string | null,
	fileRelativePath: string
): string {
	const seriesRel = (seriesPath ?? '').replace(/^[/\\]+/, '');
	let fileDir = dirname(fileRelativePath).replace(/^[/\\]+/, '');

	if (seriesRel && !(fileDir === seriesRel || fileDir.startsWith(`${seriesRel}/`))) {
		fileDir = join(seriesRel, fileDir);
	}

	return join(rootPath, fileDir);
}

async function getEpisodeFile(episodeId: string, seriesId: string): Promise<EpisodeFileRow | null> {
	const files = await db.select().from(episodeFiles).where(eq(episodeFiles.seriesId, seriesId));
	const match = files.find((f) => {
		const ids = f.episodeIds as string[] | null;
		return ids?.includes(episodeId);
	});

	return match ?? null;
}

async function getRootPath(seriesRow: SeriesRow): Promise<string> {
	if (!seriesRow.rootFolderId) return '';
	const root = await db
		.select()
		.from(rootFolders)
		.where(eq(rootFolders.id, seriesRow.rootFolderId))
		.limit(1);
	return root[0]?.path ?? '';
}

async function main() {
	const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
	let checked = 0;
	let moved = 0;
	let skipped = 0;
	let missing = 0;

	const subtitleRows = await db.select().from(subtitles).where(isNotNull(subtitles.episodeId));

	for (const subtitle of subtitleRows) {
		checked += 1;
		const episodeId = subtitle.episodeId;
		if (!episodeId) {
			skipped += 1;
			continue;
		}

		const episode = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1);
		const episodeRow = episode[0] as EpisodeRow | undefined;
		if (!episodeRow) {
			skipped += 1;
			continue;
		}

		const seriesRow = await db
			.select()
			.from(series)
			.where(eq(series.id, episodeRow.seriesId))
			.limit(1);
		const seriesData = seriesRow[0] as SeriesRow | undefined;
		if (!seriesData) {
			skipped += 1;
			continue;
		}

		const file = await getEpisodeFile(episodeId, seriesData.id);
		if (!file) {
			skipped += 1;
			continue;
		}

		const rootPath = await getRootPath(seriesData);
		const currentDir = join(rootPath, dirname(file.relativePath));
		const correctDir = resolveEpisodeMediaDir(rootPath, seriesData.path, file.relativePath);

		if (currentDir === correctDir) {
			skipped += 1;
			continue;
		}

		const fileName = subtitle.relativePath;
		const currentPath = join(currentDir, fileName);
		const correctPath = join(correctDir, fileName);

		if (!existsSync(currentPath)) {
			missing += 1;
			continue;
		}

		if (existsSync(correctPath)) {
			skipped += 1;
			continue;
		}

		if (!dryRun) {
			await mkdir(correctDir, { recursive: true });
			await rename(currentPath, correctPath);
		}

		moved += 1;
	}

	const summary = {
		checked,
		moved,
		skipped,
		missing,
		dryRun
	};

	// eslint-disable-next-line no-console
	console.log('[fix-tv-subtitle-paths] Completed', summary);
}

main().catch((error) => {
	// eslint-disable-next-line no-console
	console.error('[fix-tv-subtitle-paths] Failed', error);
	process.exitCode = 1;
});
