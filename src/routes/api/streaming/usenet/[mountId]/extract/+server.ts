/**
 * API endpoint for NZB extraction.
 *
 * NOTE: RAR extraction via streaming is no longer supported.
 * Users should use SABnzbd or NZBGet for releases that require extraction.
 *
 * This endpoint is kept for backwards compatibility but returns an error.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const NOT_SUPPORTED_MESSAGE =
	'RAR extraction is no longer supported. Please use SABnzbd or NZBGet for releases that require extraction, or search for a different release without RAR files.';

/**
 * Start extraction for a mount - NOT SUPPORTED.
 */
export const POST: RequestHandler = async () => {
	return json(
		{
			error: NOT_SUPPORTED_MESSAGE,
			code: 'EXTRACTION_NOT_SUPPORTED'
		},
		{ status: 410 } // 410 Gone - feature has been removed
	);
};

/**
 * Cancel extraction for a mount - NOT SUPPORTED.
 */
export const DELETE: RequestHandler = async () => {
	return json(
		{
			error: NOT_SUPPORTED_MESSAGE,
			code: 'EXTRACTION_NOT_SUPPORTED'
		},
		{ status: 410 }
	);
};

/**
 * Get extraction status for a mount - NOT SUPPORTED.
 */
export const GET: RequestHandler = async () => {
	return json(
		{
			error: NOT_SUPPORTED_MESSAGE,
			code: 'EXTRACTION_NOT_SUPPORTED'
		},
		{ status: 410 }
	);
};
