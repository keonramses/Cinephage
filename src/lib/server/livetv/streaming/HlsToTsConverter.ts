/**
 * HLS-to-TS Converter
 *
 * Converts an HLS live stream into a continuous MPEG-TS byte stream for
 * media server consumption (Jellyfin, Plex, Emby).
 *
 * BACKGROUND / WHY THIS EXISTS:
 * Media servers' M3U tuners (e.g. Jellyfin's HDHomeRun/M3U tuner) expect a
 * continuous MPEG-TS byte stream when tuning to a channel. They cannot consume
 * HLS playlists directly. Meanwhile, stalker portal IPTV providers enforce
 * single-use play_tokens with per-token session time limits (~24 seconds of
 * wall-clock streaming in raw TS mode). When the TS connection drops and
 * reconnects with a new token, the server replays ~20 seconds of overlapping
 * content from its internal buffer origin, creating a visible 30-45 second
 * loop for the viewer.
 *
 * HLS mode avoids the replay problem entirely because:
 * - Each playlist fetch consumes a token but returns independently-addressable
 *   segment URLs (hash-based paths on the backend, e.g. /hls/{hash}/xxx.ts)
 * - Segments are fetchable without additional auth after the initial redirect
 * - Calling createLink() again yields a fresh token and a new playlist with
 *   overlapping + new segments, tracked by EXT-X-MEDIA-SEQUENCE
 *
 * This converter bridges the gap: it speaks HLS to the portal (avoiding
 * replay) and speaks continuous TS to the media server (meeting its format
 * expectation).
 *
 * FLOW:
 * 1. Resolve a fresh stream URL via createLink (new play_token)
 * 2. Fetch the HLS playlist (consumes the token on 302 redirect)
 * 3. Parse segment URLs from the playlist
 * 4. Download segments in order, skipping already-delivered ones
 * 5. Write segment bytes to the output ReadableStream
 * 6. Wait for half the target duration, then repeat from step 1
 *
 * SEGMENT TRACKING:
 * Uses EXT-X-MEDIA-SEQUENCE + position to assign a global sequence number
 * to each segment. Only segments with sequence > lastDelivered are fetched.
 * This prevents duplicate content even across playlist refreshes with
 * overlapping segment lists.
 *
 * ERROR HANDLING:
 * - Individual segment fetch failures are logged and skipped (stream continues)
 * - Playlist-level errors trigger exponential backoff (1s, 2s, 4s, 8s, 16s)
 * - After maxConsecutiveErrors (default 5), the stream terminates with an error
 * - Client disconnect (AbortSignal) cleanly cancels the loop
 */

import { createChildLogger } from '$lib/logging';
import { getStreamUrlCache } from './StreamUrlCache.js';
import { getLiveTvStreamService } from './LiveTvStreamService.js';
import { resolveHlsUrl } from '$lib/server/streaming/utils/hls-rewrite.js';

const logger = createChildLogger({ module: 'HlsToTsConverter' });

/** Parsed segment from an HLS playlist */
interface HlsSegment {
	url: string;
	duration: number;
	sequence: number;
}

/** Parsed HLS playlist metadata */
interface ParsedPlaylist {
	segments: HlsSegment[];
	mediaSequence: number;
	targetDuration: number;
}

/**
 * Parse an HLS media playlist into structured segment data.
 *
 * @param playlistText - Raw HLS playlist text
 * @param playlistUrl - The final URL of the playlist (after redirects) for resolving relative URLs
 * @returns Parsed playlist with segments and metadata
 */
function parseHlsPlaylist(playlistText: string, playlistUrl: string): ParsedPlaylist {
	const lines = playlistText.split('\n');
	const segments: HlsSegment[] = [];

	let mediaSequence = 0;
	let targetDuration = 10;
	let currentDuration = 0;
	let segmentIndex = 0;

	const base = new URL(playlistUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
			mediaSequence = parseInt(trimmed.split(':')[1], 10) || 0;
		} else if (trimmed.startsWith('#EXT-X-TARGETDURATION:')) {
			targetDuration = parseInt(trimmed.split(':')[1], 10) || 10;
		} else if (trimmed.startsWith('#EXTINF:')) {
			// Parse duration: #EXTINF:10.243556,
			const durationStr = trimmed.substring(8).split(',')[0];
			currentDuration = parseFloat(durationStr) || 0;
		} else if (trimmed && !trimmed.startsWith('#')) {
			// This is a segment URL line
			const absoluteUrl = resolveHlsUrl(trimmed, base, basePath);
			segments.push({
				url: absoluteUrl,
				duration: currentDuration,
				sequence: mediaSequence + segmentIndex
			});
			segmentIndex++;
			currentDuration = 0;
		}
	}

	return { segments, mediaSequence, targetDuration };
}

/** Options for the HLS-to-TS converter */
export interface HlsToTsConverterOptions {
	/** Lineup item ID for stream URL resolution */
	lineupItemId: string;
	/** Timeout for individual segment fetches (ms) */
	segmentFetchTimeoutMs?: number;
	/** Maximum consecutive errors before giving up */
	maxConsecutiveErrors?: number;
	/** AbortSignal to cancel the conversion */
	signal?: AbortSignal;
}

const DEFAULT_SEGMENT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 5;
// How long to wait between playlist refreshes (fraction of target duration)
const PLAYLIST_REFRESH_RATIO = 0.5;
// Minimum interval between playlist refreshes (ms)
const MIN_PLAYLIST_REFRESH_MS = 2_000;

/**
 * Create a ReadableStream that converts an HLS live stream into continuous TS bytes.
 *
 * The stream will continue indefinitely until cancelled (client disconnects)
 * or too many consecutive errors occur. Each playlist refresh cycle requests
 * a new play_token from the portal via createLink(), so the stream is not
 * limited by the portal's per-token session timeout.
 *
 * @param options - Configuration including lineupItemId, timeouts, and abort signal
 * @returns ReadableStream of MPEG-TS bytes suitable for media server consumption
 */
export function createHlsToTsStream(options: HlsToTsConverterOptions): ReadableStream<Uint8Array> {
	const {
		lineupItemId,
		segmentFetchTimeoutMs = DEFAULT_SEGMENT_FETCH_TIMEOUT_MS,
		maxConsecutiveErrors = DEFAULT_MAX_CONSECUTIVE_ERRORS,
		signal
	} = options;

	let lastDeliveredSequence = -1;
	let consecutiveErrors = 0;
	let cancelled = false;

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			// Listen for abort signal
			if (signal) {
				signal.addEventListener(
					'abort',
					() => {
						cancelled = true;
						try {
							controller.close();
						} catch {
							// Already closed
						}
					},
					{ once: true }
				);
			}

			try {
				await runConversionLoop(controller);
			} catch (error) {
				if (!cancelled) {
					const msg = error instanceof Error ? error.message : String(error);
					logger.error('[HlsToTsConverter] Fatal error in conversion loop', error, {
						lineupItemId,
						lastDeliveredSequence
					});
					try {
						controller.error(new Error(`HLS-to-TS conversion failed: ${msg}`));
					} catch {
						// Already errored/closed
					}
				}
			}
		},

		cancel() {
			cancelled = true;
			logger.debug('[HlsToTsConverter] Stream cancelled by consumer', { lineupItemId });
		}
	});

	async function runConversionLoop(controller: ReadableStreamDefaultController<Uint8Array>) {
		const urlCache = getStreamUrlCache();
		const streamService = getLiveTvStreamService();

		logger.info('[HlsToTsConverter] Starting HLS-to-TS conversion', { lineupItemId });

		while (!cancelled) {
			try {
				// 1. Resolve a fresh stream URL (new play_token via createLink)
				const resolved = await urlCache.getStream(lineupItemId, 'hls');

				// 2. Invalidate cache immediately — the token will be consumed by the fetch
				urlCache.invalidate(lineupItemId);

				// 3. Fetch the HLS playlist (follows 302 redirect, consuming the play_token)
				const { response, finalUrl } = await streamService.fetchFromUrl(
					resolved.url,
					resolved.providerType,
					resolved.providerHeaders
				);

				if (!response.ok) {
					throw new Error(`Playlist fetch failed: ${response.status}`);
				}

				const playlistText = await response.text();

				if (!playlistText.includes('#EXTM3U')) {
					throw new Error('Invalid HLS playlist (no #EXTM3U header)');
				}

				// 4. Parse the playlist
				const playlist = parseHlsPlaylist(playlistText, finalUrl);

				if (playlist.segments.length === 0) {
					logger.warn('[HlsToTsConverter] Empty playlist', { lineupItemId });
					await sleep(1000);
					continue;
				}

				logger.debug('[HlsToTsConverter] Playlist fetched', {
					lineupItemId,
					segments: playlist.segments.length,
					mediaSequence: playlist.mediaSequence,
					targetDuration: playlist.targetDuration,
					lastDeliveredSequence
				});

				// 5. Download and pipe new segments
				let newSegmentsDelivered = 0;

				for (const segment of playlist.segments) {
					if (cancelled) break;

					// Skip already-delivered segments
					if (segment.sequence <= lastDeliveredSequence) {
						continue;
					}

					try {
						const segmentData = await fetchSegment(
							segment.url,
							resolved.providerHeaders,
							segmentFetchTimeoutMs
						);

						if (cancelled) break;

						// Write segment data to the stream
						controller.enqueue(segmentData);
						lastDeliveredSequence = segment.sequence;
						newSegmentsDelivered++;
						consecutiveErrors = 0;

						logger.debug('[HlsToTsConverter] Segment delivered', {
							lineupItemId,
							sequence: segment.sequence,
							size: segmentData.byteLength,
							duration: segment.duration
						});
					} catch (error) {
						if (cancelled) break;
						const msg = error instanceof Error ? error.message : String(error);
						logger.warn('[HlsToTsConverter] Segment fetch failed, skipping', {
							lineupItemId,
							sequence: segment.sequence,
							url: segment.url.substring(0, 80),
							error: msg
						});
						// Skip this segment and continue with the next
						lastDeliveredSequence = segment.sequence;
					}
				}

				if (cancelled) break;

				// 6. Calculate wait time before next playlist refresh
				// Use half the target duration, but at least MIN_PLAYLIST_REFRESH_MS
				const refreshInterval = Math.max(
					playlist.targetDuration * 1000 * PLAYLIST_REFRESH_RATIO,
					MIN_PLAYLIST_REFRESH_MS
				);

				if (newSegmentsDelivered === 0) {
					// No new segments — playlist hasn't advanced yet, wait a bit
					logger.debug('[HlsToTsConverter] No new segments, waiting', {
						lineupItemId,
						waitMs: refreshInterval
					});
				}

				await sleep(refreshInterval);
				consecutiveErrors = 0;
			} catch (error) {
				if (cancelled) break;

				consecutiveErrors++;
				const msg = error instanceof Error ? error.message : String(error);
				logger.warn('[HlsToTsConverter] Playlist cycle error', {
					lineupItemId,
					consecutiveErrors,
					maxConsecutiveErrors,
					error: msg
				});

				if (consecutiveErrors >= maxConsecutiveErrors) {
					throw new Error(`Too many consecutive errors (${consecutiveErrors}): ${msg}`);
				}

				// Exponential backoff: 1s, 2s, 4s, 8s, 16s
				const backoff = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 16000);
				await sleep(backoff);
			}
		}

		// Clean exit
		if (!cancelled) {
			try {
				controller.close();
			} catch {
				// Already closed
			}
		}

		logger.info('[HlsToTsConverter] Conversion loop ended', {
			lineupItemId,
			lastDeliveredSequence,
			cancelled
		});
	}
}

/**
 * Fetch a single HLS segment with timeout.
 *
 * Segment URLs on stalker backends use hash-based paths (e.g. /hls/{hash}/xxx.ts)
 * that are independently accessible without auth headers after the initial
 * playlist redirect. The STB User-Agent is still sent for compatibility.
 */
async function fetchSegment(
	url: string,
	providerHeaders?: Record<string, string>,
	timeoutMs: number = DEFAULT_SEGMENT_FETCH_TIMEOUT_MS
): Promise<Uint8Array> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3',
				Accept: '*/*',
				...providerHeaders
			},
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`Segment HTTP ${response.status}`);
		}

		const buffer = await response.arrayBuffer();
		return new Uint8Array(buffer);
	} finally {
		clearTimeout(timeout);
	}
}

/** Promise-based sleep that respects cancellation */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
