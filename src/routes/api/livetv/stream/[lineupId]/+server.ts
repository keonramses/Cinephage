/**
 * Live TV Stream Proxy
 *
 * Proxies Live TV streams from Stalker Portal sources.
 * Handles stream URL resolution, HLS manifest rewriting, and direct stream passthrough.
 *
 * GET /api/livetv/stream/:lineupId
 */

import type { RequestHandler } from './$types';
import { getStalkerStreamService } from '$lib/server/livetv/streaming';
import { getBaseUrlAsync } from '$lib/server/streaming/url';
import { isUrlSafe, fetchWithTimeout } from '$lib/server/http/ssrf-protection';
import { logger } from '$lib/logging';
import {
	LIVETV_MANIFEST_FETCH_TIMEOUT_MS,
	LIVETV_MAX_RETRIES,
	LIVETV_RETRY_BASE_DELAY_MS,
	LIVETV_PROXY_USER_AGENT
} from '$lib/server/livetv/streaming/constants';

/**
 * Fetch with retry logic for transient errors
 */
async function fetchWithRetry(
	url: string,
	options: RequestInit,
	maxRetries: number = LIVETV_MAX_RETRIES
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetchWithTimeout(url, options, LIVETV_MANIFEST_FETCH_TIMEOUT_MS);

			// Only retry on 5xx server errors
			if (response.status >= 500 && attempt < maxRetries) {
				logger.debug('[LiveTV Stream] Retrying after 5xx', {
					url: url.substring(0, 100),
					status: response.status,
					attempt: attempt + 1
				});
				await new Promise((r) => setTimeout(r, LIVETV_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on abort (timeout)
			if (lastError.name === 'AbortError') {
				throw new Error(`Stream fetch timeout after ${LIVETV_MANIFEST_FETCH_TIMEOUT_MS}ms`);
			}

			if (attempt < maxRetries) {
				logger.debug('[LiveTV Stream] Retrying after error', {
					url: url.substring(0, 100),
					error: lastError.message,
					attempt: attempt + 1
				});
				await new Promise((r) => setTimeout(r, LIVETV_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
			}
		}
	}

	throw lastError ?? new Error('Fetch failed after retries');
}

/**
 * Get headers for upstream requests
 */
function getStreamHeaders(): HeadersInit {
	return {
		'User-Agent': LIVETV_PROXY_USER_AGENT,
		Accept: '*/*',
		'Accept-Encoding': 'identity'
	};
}

/**
 * Detect if content is an HLS playlist
 */
function isHlsContent(contentType: string, url: string, body?: string): boolean {
	// Check content type
	if (
		contentType.includes('mpegurl') ||
		contentType.includes('m3u8') ||
		contentType.includes('x-mpegurl')
	) {
		return true;
	}

	// Check URL patterns
	const lowerUrl = url.toLowerCase();
	if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/')) {
		return true;
	}

	// Check content
	if (body && body.startsWith('#EXTM3U')) {
		return true;
	}

	return false;
}

/**
 * Rewrite HLS playlist URLs to route through our segment proxy
 */
function rewriteHlsPlaylist(
	playlist: string,
	originalUrl: string,
	baseUrl: string,
	lineupId: string
): string {
	const lines = playlist.split('\n');
	const result: string[] = [];

	const base = new URL(originalUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	let previousWasExtinf = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Handle URI= attributes in tags (EXT-X-MEDIA, EXT-X-KEY, etc.)
		if (
			trimmed.startsWith('#EXT-X-MEDIA:') ||
			trimmed.startsWith('#EXT-X-KEY:') ||
			trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:')
		) {
			const uriMatch = line.match(/URI="([^"]+)"/);
			if (uriMatch) {
				const originalUri = uriMatch[1];
				const absoluteUri = resolveUrl(originalUri, base, basePath);
				const proxyUri = makeSegmentProxyUrl(absoluteUri, baseUrl, lineupId, false);
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
			const proxyUrl = makeSegmentProxyUrl(absoluteUrl, baseUrl, lineupId, isSegment);
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
	return `${base.origin}${basePath}${url}`;
}

/**
 * Create a proxy URL for a segment or sub-playlist
 */
function makeSegmentProxyUrl(
	originalUrl: string,
	baseUrl: string,
	lineupId: string,
	isSegment: boolean
): string {
	const extension = isSegment ? 'ts' : 'm3u8';
	return `${baseUrl}/api/livetv/stream/${lineupId}/segment.${extension}?url=${encodeURIComponent(originalUrl)}`;
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
		const streamService = getStalkerStreamService();

		// Get stream URL (handles caching, auth, failover)
		const stream = await streamService.getStreamUrl(lineupId);

		logger.debug('[LiveTV Stream] Resolved stream', {
			lineupId,
			type: stream.type,
			fromCache: stream.fromCache,
			accountId: stream.accountId
		});

		// SSRF protection
		const safetyCheck = isUrlSafe(stream.url);
		if (!safetyCheck.safe) {
			logger.warn('[LiveTV Stream] Blocked unsafe stream URL', {
				lineupId,
				reason: safetyCheck.reason
			});
			return new Response(JSON.stringify({ error: 'Stream URL not allowed' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Fetch the stream
		const response = await fetchWithRetry(stream.url, {
			headers: getStreamHeaders(),
			redirect: 'follow'
		});

		if (!response.ok) {
			logger.error('[LiveTV Stream] Upstream error', {
				lineupId,
				status: response.status,
				statusText: response.statusText,
				streamUrl: stream.url.substring(0, 100),
				streamType: stream.type
			});
			return new Response(JSON.stringify({ error: `Upstream error: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const contentType = response.headers.get('content-type') || '';

		// Check if this is HLS content
		if (stream.type === 'hls' || isHlsContent(contentType, stream.url)) {
			// Read the playlist and rewrite URLs
			const playlist = await response.text();

			if (!playlist.includes('#EXTM3U')) {
				// Not a valid HLS playlist - try to pass through as video
				logger.warn('[LiveTV Stream] Expected HLS but got non-playlist content', { lineupId });
				return new Response(playlist, {
					status: 200,
					headers: {
						'Content-Type': contentType || 'video/mp2t',
						'Access-Control-Allow-Origin': '*',
						'Cache-Control': 'no-store'
					}
				});
			}

			const rewritten = rewriteHlsPlaylist(playlist, stream.url, baseUrl, lineupId);

			return new Response(rewritten, {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.apple.mpegurl',
					'Accept-Ranges': 'none',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
					'Access-Control-Allow-Headers': 'Range, Content-Type',
					'Cache-Control': 'no-cache',
					'X-Content-Type-Options': 'nosniff'
				}
			});
		}

		// Direct stream - pipe through
		// Note: For very long streams, this keeps the connection open
		return new Response(response.body, {
			status: 200,
			headers: {
				'Content-Type': contentType || 'video/mp2t',
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
	return new Response(null, {
		status: 200,
		headers: {
			'Content-Type': 'video/mp2t',
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
