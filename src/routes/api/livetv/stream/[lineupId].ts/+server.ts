/**
 * Stream endpoint with .ts extension
 *
 * This route exists solely to make the stream URLs end in .ts, which
 * helps media servers (Jellyfin/Plex/Emby) auto-detect the format as
 * MPEG-TS rather than forcing HLS format detection.
 *
 * All requests are forwarded to the main [lineupId] handler.
 */

import type { RequestHandler } from './$types';
import { GET as baseGET, HEAD as baseHEAD } from '../[lineupId]/+server.js';

export const GET: RequestHandler = async (event) => {
	return baseGET(event);
};

export const HEAD: RequestHandler = async (event) => {
	return baseHEAD(event);
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
