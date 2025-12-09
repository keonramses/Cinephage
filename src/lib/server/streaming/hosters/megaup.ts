/**
 * Megaup Hoster
 *
 * Resolves Megaup embed URLs to actual HLS streams.
 *
 * Supported domains:
 * - megaup.site
 * - megaup.live
 * - 4spromax.site
 *
 * Pattern:
 * 1. Convert /e/{id} to /media/{id}
 * 2. Fetch encrypted media data
 * 3. Decrypt via enc-dec.app/api/dec-mega
 * 4. Extract stream URL from response
 */

import { logger } from '$lib/logging';
import { BaseHoster, type HosterConfig, type HosterStreamSource } from './types';

const streamLog = { logCategory: 'streams' as const };

// ============================================================================
// Response Types
// ============================================================================

interface MegaupMediaResponse {
	result: string;
	status?: boolean;
}

// ============================================================================
// Hoster Implementation
// ============================================================================

export class MegaupHoster extends BaseHoster {
	readonly config: HosterConfig = {
		id: 'megaup',
		name: 'Megaup',
		domains: ['megaup.site', 'megaup.live', '4spromax.site'],
		embedPathPattern: '/e/',
		mediaPathPattern: '/media/',
		timeout: 15000
	};

	protected async doResolve(embedUrl: string): Promise<HosterStreamSource[]> {
		logger.debug('Megaup resolving embed', { embedUrl, ...streamLog });

		// Step 1: Convert embed URL to media URL
		const mediaUrl = this.toMediaUrl(embedUrl);
		logger.debug('Megaup media URL', { mediaUrl, ...streamLog });

		// Step 2: Fetch encrypted media data
		const mediaResponse = await this.fetchJson<MegaupMediaResponse>(mediaUrl);

		if (!mediaResponse.result) {
			logger.debug('Megaup no result in response', { ...streamLog });
			return [];
		}

		// Step 3: Decrypt via enc-dec.app
		const decrypted = await this.encDec.decryptMegaup({
			text: mediaResponse.result,
			agent: this.userAgent
		});

		// Step 4: Extract stream URL(s)
		const sources: HosterStreamSource[] = [];

		// Check for sources array first
		if (decrypted.sources && decrypted.sources.length > 0) {
			for (const source of decrypted.sources) {
				if (this.isValidStreamUrl(source.file)) {
					sources.push({
						url: source.file,
						quality: source.quality || this.extractQuality(source.file),
						type: source.type === 'mp4' ? 'mp4' : 'hls'
					});
				}
			}
		}

		// Fallback to single stream fields
		const streamUrl = decrypted.stream || decrypted.file || decrypted.url;
		if (this.isValidStreamUrl(streamUrl) && !sources.some((s) => s.url === streamUrl)) {
			sources.push({
				url: streamUrl,
				quality: this.extractQuality(streamUrl),
				type: 'hls'
			});
		}

		logger.debug('Megaup resolved streams', { count: sources.length, ...streamLog });
		return sources;
	}
}
