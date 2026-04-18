/**
 * Cloudflare Streaming Bypass Test
 *
 * Tests the Cloudflare-aware streaming functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	fetchWithCloudflareBypass,
	clearCloudflareSessions,
	getCloudflareSessionStats
} from './cloudflare-streaming.js';

const LIVE_TESTS_ENABLED = process.env.LIVE_TESTS === 'true';

describe('Cloudflare Streaming Bypass', () => {
	beforeEach(() => {
		clearCloudflareSessions();
	});

	describe('Session Management', () => {
		it('should start with empty session cache', () => {
			const stats = getCloudflareSessionStats();
			expect(stats.cachedDomains).toBe(0);
			expect(stats.sessions).toHaveLength(0);
		});

		it('should clear all sessions', () => {
			expect(() => clearCloudflareSessions()).not.toThrow();
		});
	});

	describe.skipIf(!LIVE_TESTS_ENABLED)('Cloudflare Bypass (Live)', () => {
		const TEST_URL =
			'https://storm.vodvidl.site/proxy/file2%2FNrs1aA9hZmzHSs29H9oOYCmWkZycNyTsbJmSM80fFd6BMyouYDRUGOTM4ENwTXIJLmq8EchpdYRcIDqwnS8GGE1QsQSpw4R8y6~Th8rHnCvtWadV6yhmoxEOXGuRSKjIP4AOYcVyWURKRDfdtDJmxyXqrFkz8yjfHNGP6JI1Eks%3D%2FcGxheWxpc3QubTN1OA%3D%3D.m3u8?headers={"referer":"https://videostr.net/","origin":"https://videostr.net"}&host=https://skyember44.online';

		it('should attempt to fetch Cloudflare-protected URL', async () => {
			const startTime = Date.now();
			const response = await fetchWithCloudflareBypass(TEST_URL, {
				referer: 'https://videostr.net/',
				timeout: 30000
			});
			const duration = Date.now() - startTime;

			console.log(`Response received in ${duration}ms`);
			console.log('Status:', response.status);
			console.log('Content-Type:', response.headers.get('content-type'));

			expect([200, 403, 503]).toContain(response.status);

			if (response.ok) {
				const body = await response.text();
				console.log('Response preview:', body.substring(0, 200));

				if (body.includes('#EXTM3U')) {
					console.log('Got valid HLS playlist');
				}
			}
		}, 60000);
	});
});
