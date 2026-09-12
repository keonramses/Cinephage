/**
 * Shared helpers for building Radarr-compatible MovieResource objects from
 * Cinephage's `movies` row - status derivation, TMDB image URLs, and title
 * normalization that don't belong to any one field.
 */

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

/** MovieStatusType enum: tba | announced | inCinemas | released | deleted. */
export function deriveMovieStatus(row: {
	hasFile: boolean | null;
	releaseDate: string | null;
	digitalReleaseDate: string | null;
	physicalReleaseDate: string | null;
}): string {
	if (row.hasFile) return 'released';
	if (!row.releaseDate) return 'tba';

	const now = Date.now();
	const release = new Date(row.releaseDate).getTime();
	if (Number.isNaN(release) || release > now) return 'announced';

	const digital = row.digitalReleaseDate ? new Date(row.digitalReleaseDate).getTime() : null;
	const physical = row.physicalReleaseDate ? new Date(row.physicalReleaseDate).getTime() : null;
	if ((digital && digital > now) || (physical && physical > now)) return 'inCinemas';

	return 'released';
}

export function cleanTitleFor(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function titleSlugFor(tmdbId: number): string {
	return String(tmdbId);
}

export function folderNameFor(path: string): string {
	return path.split('/').filter(Boolean).pop() ?? path;
}

export function buildMovieImages(
	posterPath: string | null | undefined,
	backdropPath: string | null | undefined
): Array<{ coverType: string; url: string; remoteUrl: string }> {
	const images: Array<{ coverType: string; url: string; remoteUrl: string }> = [];
	if (posterPath) {
		const url = `${TMDB_IMAGE_BASE}${posterPath}`;
		images.push({ coverType: 'poster', url, remoteUrl: url });
	}
	if (backdropPath) {
		const url = `${TMDB_IMAGE_BASE}${backdropPath}`;
		images.push({ coverType: 'fanart', url, remoteUrl: url });
	}
	return images;
}

export function tmdbPosterUrl(posterPath: string | null | undefined): string | null {
	return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
}
