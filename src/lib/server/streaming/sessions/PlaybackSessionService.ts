import { logger } from '$lib/logging';
import { getCinephageApiService } from '../cinephage-api/CinephageApiService';
import { filterStreamsByLanguage } from '../language-utils';
import { resolveHlsUrl } from '../utils/hls-rewrite.js';
import type {
	PlaybackMediaType,
	PlaybackSession,
	PlaybackSessionAttempt,
	PlaybackSessionSubtitle,
	StreamSource
} from '../types';
import { getPlaybackSessionStore } from './session-store';

const streamLog = { logDomain: 'streams' as const };

interface PlaybackLaunchParams {
	tmdbId: number;
	type: PlaybackMediaType;
	season?: number;
	episode?: number;
	forceRefresh?: boolean;
}

interface ProbeResult {
	success: boolean;
	entryUrl: string;
	sourceType: StreamSource['type'];
	error?: string;
	statusCode?: number;
}

function firstNonCommentLine(content: string): string | null {
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		return trimmed;
	}

	return null;
}

function buildSourceHeaders(source: StreamSource): Record<string, string> {
	const headers = {
		...(source.headers ?? {})
	};

	if (!headers.Referer && !headers.referer && source.referer) {
		headers.Referer = source.referer;
	}

	return headers;
}

function normalizeSubtitleList(source: StreamSource): PlaybackSessionSubtitle[] {
	return (source.subtitles ?? []).map((subtitle, index) => ({
		id: `sub-${index}`,
		url: subtitle.url,
		label: subtitle.label,
		language: subtitle.language,
		isDefault: subtitle.isDefault
	}));
}

function inferStatusCode(error: unknown): number | undefined {
	if (!(error instanceof Error)) {
		return undefined;
	}

	const match = error.message.match(/HTTP (\d+)/i);
	if (!match) {
		return undefined;
	}

	return parseInt(match[1], 10);
}

async function getPreferredLanguages(tmdbId: number, type: PlaybackMediaType): Promise<string[]> {
	try {
		if (type === 'movie') {
			const { getPreferredLanguagesForMovie } = await import('../language-profile-helper');
			return await getPreferredLanguagesForMovie(tmdbId);
		}

		const { getPreferredLanguagesForSeries } = await import('../language-profile-helper');
		return await getPreferredLanguagesForSeries(tmdbId);
	} catch {
		return [];
	}
}

async function fetchText(url: string, headers: Record<string, string>): Promise<Response> {
	return await fetch(url, {
		headers: {
			Accept: '*/*',
			...headers
		}
	});
}

async function probeSource(source: StreamSource): Promise<ProbeResult> {
	const headers = buildSourceHeaders(source);

	try {
		const response = await fetchText(source.url, headers);
		if (!response.ok) {
			return {
				success: false,
				entryUrl: source.url,
				sourceType: source.type,
				error: `HTTP ${response.status}`,
				statusCode: response.status
			};
		}

		if (source.type === 'mp4') {
			return {
				success: true,
				entryUrl: response.url,
				sourceType: 'mp4'
			};
		}

		const playlist = await response.text();
		if (!playlist.trimStart().startsWith('#EXTM3U')) {
			return {
				success: false,
				entryUrl: source.url,
				sourceType: source.type,
				error: 'Source did not return an HLS playlist'
			};
		}

		let mediaPlaylistUrl = response.url;
		if (playlist.includes('#EXT-X-STREAM-INF')) {
			const firstVariant = firstNonCommentLine(playlist);
			if (!firstVariant) {
				return {
					success: false,
					entryUrl: response.url,
					sourceType: source.type,
					error: 'Master playlist did not contain any variants'
				};
			}

			mediaPlaylistUrl = resolveHlsUrl(
				firstVariant,
				new URL(response.url),
				new URL(response.url).pathname.substring(
					0,
					new URL(response.url).pathname.lastIndexOf('/') + 1
				)
			);
		}

		const mediaResponse = await fetchText(mediaPlaylistUrl, headers);
		if (!mediaResponse.ok) {
			return {
				success: false,
				entryUrl: response.url,
				sourceType: source.type,
				error: `HTTP ${mediaResponse.status}`,
				statusCode: mediaResponse.status
			};
		}

		const mediaPlaylist = await mediaResponse.text();
		const firstAsset = firstNonCommentLine(mediaPlaylist);
		if (!firstAsset) {
			return {
				success: false,
				entryUrl: response.url,
				sourceType: source.type,
				error: 'Media playlist did not contain any segments'
			};
		}

		const mediaBase = new URL(mediaResponse.url);
		const mediaBasePath = mediaBase.pathname.substring(0, mediaBase.pathname.lastIndexOf('/') + 1);
		const assetUrl = resolveHlsUrl(firstAsset, mediaBase, mediaBasePath);
		const assetResponse = await fetchText(assetUrl, headers);
		if (!assetResponse.ok) {
			return {
				success: false,
				entryUrl: response.url,
				sourceType: source.type,
				error: `HTTP ${assetResponse.status}`,
				statusCode: assetResponse.status
			};
		}

		return {
			success: true,
			entryUrl: response.url,
			sourceType: source.type
		};
	} catch (error) {
		return {
			success: false,
			entryUrl: source.url,
			sourceType: source.type,
			error: error instanceof Error ? error.message : String(error),
			statusCode: inferStatusCode(error)
		};
	}
}

export class PlaybackSessionService {
	private readonly api = getCinephageApiService();
	private readonly store = getPlaybackSessionStore();

	async createOrReuseSession(params: PlaybackLaunchParams): Promise<{
		session: PlaybackSession | null;
		error?: string;
	}> {
		if (!params.forceRefresh) {
			const existing = this.store.findReusableSession(
				params.type,
				params.tmdbId,
				params.season,
				params.episode
			);
			if (existing) {
				return { session: existing };
			}
		}

		const preferredLanguages = await getPreferredLanguages(params.tmdbId, params.type);
		const lookup = await this.api.getStreams({
			tmdbId: params.tmdbId,
			type: params.type,
			season: params.season,
			episode: params.episode
		});

		if (!lookup.success || !lookup.sources.length) {
			return {
				session: null,
				error: lookup.error || 'No playable stream sources found'
			};
		}

		const { matching, fallback } = filterStreamsByLanguage(lookup.sources, preferredLanguages);
		const orderedSources = [...matching, ...fallback];
		const attempts: PlaybackSessionAttempt[] = [];

		for (const source of orderedSources) {
			const probe = await probeSource(source);
			attempts.push({
				provider: source.provider,
				url: source.url,
				success: probe.success,
				error: probe.error,
				statusCode: probe.statusCode
			});

			if (!probe.success) {
				continue;
			}

			const session = this.store.createSession({
				mediaType: params.type,
				tmdbId: params.tmdbId,
				season: params.season,
				episode: params.episode,
				provider: source.provider,
				entryUrl: probe.entryUrl,
				sourceType: probe.sourceType,
				requestHeaders: buildSourceHeaders(source),
				subtitles: normalizeSubtitleList(source),
				attempts
			});

			logger.info(
				{
					sessionToken: session.token,
					provider: source.provider,
					sourceType: probe.sourceType,
					entryUrl: probe.entryUrl,
					quality: source.quality,
					language: source.language,
					attempts: attempts.length,
					tmdbId: params.tmdbId,
					mediaType: params.type,
					season: params.season,
					episode: params.episode,
					...streamLog
				},
				'Playback session created'
			);

			return { session };
		}

		return {
			session: null,
			error: attempts[attempts.length - 1]?.error || 'All stream sources failed'
		};
	}
}

let playbackSessionServiceInstance: PlaybackSessionService | null = null;

export function getPlaybackSessionService(): PlaybackSessionService {
	if (!playbackSessionServiceInstance) {
		playbackSessionServiceInstance = new PlaybackSessionService();
	}

	return playbackSessionServiceInstance;
}
