/**
 * Live TV Segment Proxy
 *
 * Proxies HLS segments and sub-playlists for Live TV streams.
 * Handles URL rewriting for nested playlists and passes through segment data.
 *
 * GET /api/livetv/stream/:lineupId/:path?url=<encoded_url>
 */

import type { RequestHandler } from './$types';
import { getBaseUrlAsync } from '$lib/server/streaming/url';
import { isUrlSafe, fetchWithTimeout } from '$lib/server/http/ssrf-protection';
import { logger } from '$lib/logging';
import {
	LIVETV_SEGMENT_FETCH_TIMEOUT_MS,
	LIVETV_SEGMENT_MAX_SIZE,
	LIVETV_SEGMENT_CACHE_MAX_AGE,
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
			const response = await fetchWithTimeout(url, options, LIVETV_SEGMENT_FETCH_TIMEOUT_MS);

			// Only retry on 5xx server errors
			if (response.status >= 500 && attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, LIVETV_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on abort (timeout)
			if (lastError.name === 'AbortError') {
				throw new Error(`Segment fetch timeout`);
			}

			if (attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, LIVETV_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
			}
		}
	}

	throw lastError ?? new Error('Segment fetch failed');
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

		// Handle URI= attributes in tags
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

		// Track EXTINF lines
		if (trimmed.startsWith('#EXTINF:')) {
			result.push(line);
			previousWasExtinf = true;
			continue;
		}

		// Keep comments and empty lines
		if (line.startsWith('#') || trimmed === '') {
			result.push(line);
			previousWasExtinf = false;
			continue;
		}

		// URL line - rewrite it
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

export const GET: RequestHandler = async ({ params, url, request }) => {
	const { lineupId, path } = params;

	// Get segment URL from query parameter
	const segmentUrl = url.searchParams.get('url');
	if (!segmentUrl) {
		return new Response(JSON.stringify({ error: 'Missing segment URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const decodedUrl = decodeURIComponent(segmentUrl);

	// SSRF protection
	const safetyCheck = isUrlSafe(decodedUrl);
	if (!safetyCheck.safe) {
		logger.warn('[LiveTV Segment] Blocked unsafe URL', {
			lineupId,
			reason: safetyCheck.reason
		});
		return new Response(JSON.stringify({ error: 'URL blocked', reason: safetyCheck.reason }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const response = await fetchWithRetry(decodedUrl, {
			headers: getStreamHeaders(),
			redirect: 'follow'
		});

		if (!response.ok) {
			return new Response(JSON.stringify({ error: `Segment fetch failed: ${response.status}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Check content length before reading
		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			const size = parseInt(contentLength, 10);
			if (size > LIVETV_SEGMENT_MAX_SIZE) {
				logger.warn('[LiveTV Segment] Segment too large', {
					lineupId,
					size,
					maxSize: LIVETV_SEGMENT_MAX_SIZE
				});
				return new Response(JSON.stringify({ error: 'Segment too large' }), {
					status: 413,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		const contentType = response.headers.get('content-type') || '';

		// Check if this is a nested playlist that needs rewriting
		const isPlaylist =
			contentType.includes('mpegurl') ||
			contentType.includes('m3u8') ||
			path?.endsWith('.m3u8') ||
			decodedUrl.toLowerCase().includes('.m3u8');

		if (isPlaylist) {
			const playlist = await response.text();

			if (playlist.includes('#EXTM3U')) {
				const baseUrl = await getBaseUrlAsync(request);
				const rewritten = rewriteHlsPlaylist(playlist, decodedUrl, baseUrl, lineupId);

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
		}

		// Read segment data
		const arrayBuffer = await response.arrayBuffer();

		// Detect actual content type from bytes if needed
		const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
		let actualContentType = contentType;

		if (!actualContentType || actualContentType === 'application/octet-stream') {
			// MPEG-TS sync byte
			if (firstBytes[0] === 0x47) {
				actualContentType = 'video/mp2t';
			}
			// fMP4 box header
			else if (firstBytes[0] === 0x00 && firstBytes[1] === 0x00 && firstBytes[2] === 0x00) {
				actualContentType = 'video/mp4';
			}
			// AAC ADTS header
			else if (firstBytes[0] === 0xff && (firstBytes[1] & 0xf0) === 0xf0) {
				actualContentType = 'audio/aac';
			}
		}

		return new Response(arrayBuffer, {
			status: 200,
			headers: {
				'Content-Type': actualContentType || 'video/mp2t',
				'Content-Length': arrayBuffer.byteLength.toString(),
				'Accept-Ranges': 'none',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
				'Access-Control-Allow-Headers': 'Range, Content-Type',
				'Cache-Control': `public, max-age=${LIVETV_SEGMENT_CACHE_MAX_AGE}`,
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		logger.error('[LiveTV Segment] Segment proxy failed', error, {
			lineupId,
			url: decodedUrl.substring(0, 100)
		});
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : 'Segment proxy error' }),
			{
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

export const HEAD: RequestHandler = async ({ params, url }) => {
	const segmentUrl = url.searchParams.get('url');

	if (!segmentUrl) {
		return new Response(null, { status: 400 });
	}

	// Determine content type from URL pattern
	const isPlaylist = segmentUrl.toLowerCase().includes('.m3u8') || params.path?.endsWith('.m3u8');
	const contentType = isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t';

	return new Response(null, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Accept-Ranges': 'none',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Range, Content-Type',
			'Cache-Control': isPlaylist ? 'no-cache' : `public, max-age=${LIVETV_SEGMENT_CACHE_MAX_AGE}`,
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
