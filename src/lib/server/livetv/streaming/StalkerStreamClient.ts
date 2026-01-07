/**
 * Stalker Stream Client
 *
 * Extended Stalker Portal client with stream URL resolution capabilities.
 * Adds the create_link API call to resolve channel cmd to actual stream URLs.
 */

import { StalkerPortalClient } from '$lib/server/livetv/stalker/StalkerPortalClient';
import { logger } from '$lib/logging';
import type { CreateLinkResult, StreamType } from './types';
import { HLS_URL_PATTERNS, DIRECT_URL_PATTERNS, LIVETV_HLS_URL_TTL_MS } from './constants';

interface CreateLinkResponse {
	cmd: string;
}

export class StalkerStreamClient extends StalkerPortalClient {
	/**
	 * Resolve a channel cmd to an actual stream URL.
	 * This is what a real STB does when you tune to a channel.
	 *
	 * @param cmd - The channel command from the portal (e.g., "ffmpeg http://localhost/ch/534_")
	 * @returns The resolved stream URL with type detection
	 */
	async createLink(cmd: string): Promise<CreateLinkResult> {
		await this.ensureToken();

		// Normalize the cmd to canonical format for create_link API
		// Different portals store cmd in different formats:
		// - Canonical: "ffmpeg http://localhost/ch/534_"
		// - Full URL: "ffmpeg http://portal.com/play/live.php?mac=XX&stream=534&extension=ts&play_token=YY|..."
		const canonicalCmd = this.normalizeCmd(cmd);

		logger.debug('[StalkerStreamClient] Creating link', {
			portalUrl: this.portalUrl,
			originalCmd: cmd.substring(0, 60) + (cmd.length > 60 ? '...' : ''),
			canonicalCmd
		});

		try {
			const result = await this.request<CreateLinkResponse>('itv', 'create_link', {
				cmd: canonicalCmd
			});

			if (!result?.cmd) {
				throw new Error('No stream URL returned from portal');
			}

			// Parse the response - may be "ffmpeg URL" format or direct URL
			const streamUrl = result.cmd.replace(/^ffmpeg\s*/i, '').trim();

			if (!streamUrl) {
				throw new Error('Portal returned empty stream URL');
			}

			// Detect stream type from URL
			const type = this.detectStreamType(streamUrl);

			// Estimate expiration based on stream type
			// HLS streams typically have longer-lived master URLs
			// Direct streams may have tokens that expire sooner
			const ttl = type === 'hls' ? LIVETV_HLS_URL_TTL_MS : LIVETV_HLS_URL_TTL_MS / 2;
			const expiresAt = Date.now() + ttl;

			logger.debug('[StalkerStreamClient] Link created successfully', {
				type,
				urlLength: streamUrl.length,
				expiresIn: Math.round(ttl / 1000 / 60) + ' minutes'
			});

			return { url: streamUrl, type, expiresAt };
		} catch (error) {
			logger.error('[StalkerStreamClient] Failed to create link', error, {
				portalUrl: this.portalUrl,
				cmd: canonicalCmd
			});
			throw error;
		}
	}

	/**
	 * Normalize a cmd to canonical format for create_link API.
	 * The create_link API expects: "ffmpeg http://localhost/ch/{stream_id}_"
	 * But some portals store full URLs with tokens in the cmd field.
	 */
	private normalizeCmd(cmd: string): string {
		// Remove ffmpeg prefix and pipe-separated metadata
		const url = cmd
			.replace(/^ffmpeg\s*/i, '')
			.split('|')[0]
			.trim();

		// If already canonical format, return as-is
		if (url.includes('localhost/ch/')) {
			return cmd.split('|')[0].trim(); // Keep ffmpeg prefix if present
		}

		// Extract stream ID from full URL (e.g., stream=45468 or /ch/45468)
		const streamMatch = url.match(/[?&]stream=(\d+)/) || url.match(/\/ch\/(\d+)/);
		if (streamMatch) {
			const streamId = streamMatch[1];
			return `ffmpeg http://localhost/ch/${streamId}_`;
		}

		// Fallback: use original cmd (may fail but let portal handle it)
		logger.warn('[StalkerStreamClient] Could not normalize cmd, using as-is', {
			cmd: cmd.substring(0, 80)
		});
		return cmd.split('|')[0].trim();
	}

	/**
	 * Detect stream type from URL patterns
	 */
	private detectStreamType(url: string): StreamType {
		const lowered = url.toLowerCase();

		// Check for HLS indicators
		for (const pattern of HLS_URL_PATTERNS) {
			if (lowered.includes(pattern)) {
				return 'hls';
			}
		}

		// Check for direct stream indicators
		for (const pattern of DIRECT_URL_PATTERNS) {
			if (lowered.includes(pattern)) {
				return 'direct';
			}
		}

		// Default to unknown - will need content-type probing
		return 'unknown';
	}

	/**
	 * Check if this client has a valid token
	 */
	hasToken(): boolean {
		return this.token !== null;
	}

	/**
	 * Force a new handshake to refresh the token
	 */
	async refreshToken(): Promise<void> {
		this.token = null;
		await this.handshake();
	}

	/**
	 * Get portal URL for identification
	 */
	getPortalUrl(): string {
		return this.portalUrl;
	}

	/**
	 * Get MAC address for identification
	 */
	getMacAddress(): string {
		return this.macAddress;
	}
}

/**
 * Create a new Stalker Stream client instance
 */
export function createStalkerStreamClient(
	portalUrl: string,
	macAddress: string
): StalkerStreamClient {
	return new StalkerStreamClient(portalUrl, macAddress);
}
