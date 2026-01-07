/**
 * MediaBrowser Client
 *
 * HTTP client for communicating with Jellyfin and Emby servers.
 * Both use the same MediaBrowser API with minimal differences.
 */

import { logger } from '$lib/logging';
import type {
	MediaBrowserPathMapping,
	MediaBrowserServerType,
	MediaBrowserTestResult,
	LibraryUpdatePayload,
	MediaBrowserSystemInfo
} from './types';

export interface MediaBrowserClientConfig {
	host: string;
	apiKey: string;
	serverType: MediaBrowserServerType;
}

export class MediaBrowserClient {
	private readonly host: string;
	private readonly apiKey: string;
	private readonly serverType: MediaBrowserServerType;

	constructor(config: MediaBrowserClientConfig) {
		// Normalize host - remove trailing slash
		this.host = config.host.replace(/\/+$/, '');
		this.apiKey = config.apiKey;
		this.serverType = config.serverType;
	}

	/**
	 * Test connection to the MediaBrowser server
	 */
	async test(): Promise<MediaBrowserTestResult> {
		try {
			const response = await this.request('/System/Info');

			if (!response.ok) {
				if (response.status === 401) {
					return { success: false, error: 'Invalid API key' };
				}
				return {
					success: false,
					error: `Server returned ${response.status}: ${response.statusText}`
				};
			}

			const data = (await response.json()) as MediaBrowserSystemInfo;

			return {
				success: true,
				serverInfo: {
					serverName: data.ServerName,
					version: data.Version,
					id: data.Id
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			if (message.includes('ECONNREFUSED')) {
				return { success: false, error: 'Connection refused - is the server running?' };
			}
			if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
				return { success: false, error: 'Host not found - check the server address' };
			}
			if (message.includes('ETIMEDOUT')) {
				return { success: false, error: 'Connection timed out' };
			}

			return { success: false, error: message };
		}
	}

	/**
	 * Notify the server about library updates
	 */
	async notifyLibraryUpdate(payload: LibraryUpdatePayload): Promise<void> {
		try {
			const response = await this.request('/Library/Media/Updated', {
				method: 'POST',
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				logger.warn('MediaBrowser library update failed', {
					serverType: this.serverType,
					status: response.status,
					statusText: response.statusText
				});
			} else {
				logger.debug('MediaBrowser library update sent', {
					serverType: this.serverType,
					updates: payload.Updates.length
				});
			}
		} catch (error) {
			logger.error('MediaBrowser library update error', {
				serverType: this.serverType,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Trigger a full library refresh (fallback)
	 */
	async refreshLibrary(): Promise<void> {
		try {
			const response = await this.request('/Library/Refresh', {
				method: 'POST'
			});

			if (!response.ok) {
				logger.warn('MediaBrowser library refresh failed', {
					serverType: this.serverType,
					status: response.status
				});
			} else {
				logger.debug('MediaBrowser library refresh triggered', {
					serverType: this.serverType
				});
			}
		} catch (error) {
			logger.error('MediaBrowser library refresh error', {
				serverType: this.serverType,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Make an HTTP request to the MediaBrowser server
	 */
	private async request(path: string, options: RequestInit = {}): Promise<Response> {
		const url = `${this.host}${path}`;

		const headers = new Headers(options.headers);
		headers.set('X-MediaBrowser-Token', this.apiKey);
		headers.set('Accept', 'application/json');

		if (options.body) {
			headers.set('Content-Type', 'application/json');
		}

		return fetch(url, {
			...options,
			headers,
			signal: AbortSignal.timeout(10000) // 10 second timeout
		});
	}

	/**
	 * Map a local path to a remote path using the configured mappings
	 */
	static mapPath(localPath: string, mappings: MediaBrowserPathMapping[] | null): string {
		if (!mappings || mappings.length === 0) {
			return localPath;
		}

		// Normalize the local path
		const normalizedLocal = localPath.replace(/\/+$/, '');

		for (const mapping of mappings) {
			const normalizedFrom = mapping.localPath.replace(/\/+$/, '');

			if (normalizedLocal.startsWith(normalizedFrom)) {
				const relativePath = normalizedLocal.slice(normalizedFrom.length);
				const normalizedTo = mapping.remotePath.replace(/\/+$/, '');
				return normalizedTo + relativePath;
			}
		}

		// No mapping matched, return original path
		return localPath;
	}
}
