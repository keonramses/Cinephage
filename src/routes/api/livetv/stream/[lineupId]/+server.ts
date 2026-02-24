/**
 * Live TV Stream Proxy
 *
 * Proxies Live TV streams from all provider sources (Stalker, XStream, M3U).
 * Handles stream URL resolution, HLS manifest rewriting, and direct stream passthrough.
 *
 * ARCHITECTURE:
 * - HLS streams: Use cached URLs with segment-level validation/refresh
 * - Direct TS streams: Just-in-time URL generation with resilient wrapper (no caching)
 *
 * Based on Stalkerhek pattern for token expiration handling.
 *
 * GET /api/livetv/stream/:lineupId
 */

import type { RequestHandler } from './$types';
import { getStreamUrlCache } from '$lib/server/livetv/streaming/StreamUrlCache.js';
import { getLiveTvStreamService } from '$lib/server/livetv/streaming/LiveTvStreamService.js';
import { createResilientStream } from '$lib/server/livetv/streaming/ResilientStream.js';
import { getBaseUrlAsync } from '$lib/server/streaming/url';
import { logger } from '$lib/logging';

/**
 * Rewrite HLS playlist URLs to route through our segment proxy
 */
function rewriteHlsPlaylist(
	playlist: string,
	originalUrl: string,
	baseUrl: string,
	lineupId: string,
	providerHeaders?: Record<string, string>
): string {
	const lines = playlist.split('\n');
	const result: string[] = [];

	const base = new URL(originalUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	// Encode provider headers once for all segment URLs
	const encodedHeaders = encodeProviderHeaders(providerHeaders);

	let previousWasExtinf = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Handle URI= attributes in tags (EXT-X-MEDIA, EXT-X-KEY, EXT-X-MAP, EXT-X-STREAM-INF, etc.)
		if (
			trimmed.startsWith('#EXT-X-MEDIA:') ||
			trimmed.startsWith('#EXT-X-KEY:') ||
			trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:') ||
			trimmed.startsWith('#EXT-X-MAP:') ||
			trimmed.startsWith('#EXT-X-STREAM-INF:')
		) {
			const uriMatch = line.match(/URI="([^"]+)"/);
			if (uriMatch) {
				const originalUri = uriMatch[1];
				const absoluteUri = resolveUrl(originalUri, base, basePath);
				const proxyUri = makeSegmentProxyUrl(absoluteUri, baseUrl, lineupId, false, encodedHeaders);
				result.push(line.replace(`URI="${originalUri}"`, `URI="${proxyUri}"`));
				continue;
			}
		}

		// Track EXTINF lines - the next URL line is always a segment
		if (trimmed.startsWith('#EXTINF:')) {
			result.push(line);
			previousWasExtinf = true;
			continue;
		}

		// Keep other comments and empty lines as-is
		if (line.startsWith('#') || trimmed === '') {
			result.push(line);
			previousWasExtinf = false;
			continue;
		}

		// This is a URL line - rewrite it
		if (trimmed) {
			const absoluteUrl = resolveUrl(trimmed, base, basePath);
			const isSegment =
				previousWasExtinf ||
				trimmed.includes('.ts') ||
				trimmed.includes('.aac') ||
				trimmed.includes('.mp4');
			const proxyUrl = makeSegmentProxyUrl(
				absoluteUrl,
				baseUrl,
				lineupId,
				isSegment,
				encodedHeaders
			);
			result.push(proxyUrl);
		} else {
			result.push(line);
		}
		previousWasExtinf = false;
	}

	return result.join('\n');
}

/**
 * Resolve a potentially relative URL to absolute
 * Preserves query parameters from the base URL for authentication tokens
 */
function resolveUrl(url: string, base: URL, basePath: string): string {
	if (url.startsWith('http://') || url.startsWith('https://')) {
		return url;
	}
	if (url.startsWith('//')) {
		return `${base.protocol}${url}`;
	}
	if (url.startsWith('/')) {
		return `${base.origin}${url}`;
	}
	// Preserve query parameters from base URL (e.g., auth tokens)
	const queryString = base.search || '';
	return `${base.origin}${basePath}${url}${queryString}`;
}

/**
 * Encode provider headers as a base64 string for embedding in URLs.
 * Returns undefined if no headers to encode.
 */
function encodeProviderHeaders(headers?: Record<string, string>): string | undefined {
	if (!headers || Object.keys(headers).length === 0) return undefined;
	return btoa(JSON.stringify(headers));
}

/**
 * Create a proxy URL for a segment or sub-playlist
 */
function makeSegmentProxyUrl(
	originalUrl: string,
	baseUrl: string,
	lineupId: string,
	isSegment: boolean,
	encodedHeaders?: string
): string {
	const extension = isSegment ? 'ts' : 'm3u8';
	let proxyUrl = `${baseUrl}/api/livetv/stream/${lineupId}/segment.${extension}?url=${encodeURIComponent(originalUrl)}`;
	if (encodedHeaders) {
		proxyUrl += `&h=${encodeURIComponent(encodedHeaders)}`;
	}
	return proxyUrl;
}

export const GET: RequestHandler = async ({ params, request }) => {
	const { lineupId } = params;

	if (!lineupId) {
		return new Response(JSON.stringify({ error: 'Missing lineup ID' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const baseUrl = await getBaseUrlAsync(request);
		const urlCache = getStreamUrlCache();

		// Get or resolve stream URL using the cache
		// This ensures the URL is cached and can be refreshed by the segment proxy
		const stream = await urlCache.getStream(lineupId);

		logger.debug('[LiveTV Stream] Stream fetched', {
			lineupId,
			type: stream.type,
			providerType: stream.providerType,
			accountId: stream.accountId,
			url: stream.url.substring(0, 50)
		});

		// For HLS streams, we need to fetch the playlist content
		if (stream.type === 'hls' || stream.url.toLowerCase().includes('.m3u8')) {
			// Fetch the playlist directly
			const response = await fetch(stream.url, {
				headers: {
					'User-Agent':
						'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3',
					Accept: '*/*',
					Connection: 'keep-alive',
					...stream.providerHeaders
				},
				redirect: 'follow'
			});

			if (!response.ok) {
				// If fetch fails, invalidate cache and try once more with fresh URL
				logger.warn('[LiveTV Stream] Initial playlist fetch failed, refreshing URL', {
					lineupId,
					status: response.status
				});
				urlCache.invalidate(lineupId);
				const refreshed = await urlCache.getStream(lineupId);

				const retryResponse = await fetch(refreshed.url, {
					headers: {
						'User-Agent':
							'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3',
						Accept: '*/*',
						Connection: 'keep-alive',
						...refreshed.providerHeaders
					},
					redirect: 'follow'
				});

				if (!retryResponse.ok) {
					throw new Error(`Failed to fetch playlist: ${retryResponse.status}`);
				}

				const playlist = await retryResponse.text();
				if (!playlist.includes('#EXTM3U')) {
					throw new Error('Invalid HLS playlist received');
				}

				const rewritten = rewriteHlsPlaylist(
					playlist,
					refreshed.url,
					baseUrl,
					lineupId,
					refreshed.providerHeaders
				);

				return new Response(rewritten, {
					status: 200,
					headers: {
						'Content-Type': 'application/vnd.apple.mpegurl',
						'Accept-Ranges': 'none',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
						'Access-Control-Allow-Headers': 'Range, Content-Type',
						'Cache-Control': 'public, max-age=2, stale-while-revalidate=5',
						'X-Content-Type-Options': 'nosniff'
					}
				});
			}

			const playlist = await response.text();

			if (!playlist.includes('#EXTM3U')) {
				// Not a valid HLS playlist - try to pass through as video
				logger.warn('[LiveTV Stream] Expected HLS but got non-playlist content', { lineupId });
				return new Response(playlist, {
					status: 200,
					headers: {
						'Content-Type': response.headers.get('content-type') || 'video/mp2t',
						'Access-Control-Allow-Origin': '*',
						'Cache-Control': 'no-store'
					}
				});
			}

			const rewritten = rewriteHlsPlaylist(
				playlist,
				stream.url,
				baseUrl,
				lineupId,
				stream.providerHeaders
			);

			return new Response(rewritten, {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.apple.mpegurl',
					'Accept-Ranges': 'none',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
					'Access-Control-Allow-Headers': 'Range, Content-Type',
					'Cache-Control': 'public, max-age=2, stale-while-revalidate=5',
					'X-Content-Type-Options': 'nosniff'
				}
			});
		}

		// Direct stream - use resilient stream wrapper for automatic reconnection
		// CRITICAL: For direct TS streams, we must generate URLs JUST-IN-TIME (not ahead of time)
		// The play_token expires within seconds, so we generate the URL right before connecting
		logger.info('[LiveTV Stream] Using resilient stream wrapper with just-in-time URL generation', {
			lineupId,
			strategy: 'no-cache-direct-stream'
		});

		const streamService = getLiveTvStreamService();

		// Create a provider function that generates FRESH URLs on each connection
		// This bypasses all caching to ensure the token is as fresh as possible
		const streamProvider = async () => {
			// Fetch fresh stream URL right before connection
			// Don't use cache - generate new token each time
			logger.debug('[LiveTV Stream] Generating fresh stream URL for connection', { lineupId });
			return streamService.fetchStream(lineupId);
		};

		// Create resilient stream that auto-reconnects on failure
		// The stream wrapper will call streamProvider() each time it needs to reconnect
		const resilientStream = createResilientStream(lineupId, streamProvider);

		return new Response(resilientStream, {
			status: 200,
			headers: {
				'Content-Type': 'video/mp2t',
				'Transfer-Encoding': 'chunked',
				'Accept-Ranges': 'none',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
				'Access-Control-Allow-Headers': 'Range, Content-Type',
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Stream failed';
		logger.error('[LiveTV Stream] Stream resolution failed', error, { lineupId });

		// Determine appropriate status code
		let status = 502;
		if (message.includes('not found')) {
			status = 404;
		} else if (message.includes('disabled')) {
			status = 403;
		}

		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const HEAD: RequestHandler = async ({ params }) => {
	const { lineupId } = params;

	if (!lineupId) {
		return new Response(null, { status: 400 });
	}

	// Return expected headers immediately without resolving the stream.
	// This is critical for Jellyfin/Plex which probe streams with HEAD before playing.
	// Most live TV streams are HLS, so return the HLS content type to match what GET returns.
	return new Response(null, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.apple.mpegurl',
			'Accept-Ranges': 'none',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type'
		}
	});
};
