import type { MediaServerStatsProvider, MediaServerStatsProviderConfig } from '../types.js';
import { JellyfinStatsProvider } from './JellyfinStatsProvider.js';
import { EmbyStatsProvider } from './EmbyStatsProvider.js';
import { PlexStatsProvider } from './PlexStatsProvider.js';

export function createStatsProvider(
	config: MediaServerStatsProviderConfig
): MediaServerStatsProvider {
	switch (config.serverType) {
		case 'jellyfin':
			return new JellyfinStatsProvider(config);
		case 'emby':
			return new EmbyStatsProvider(config);
		case 'plex':
			return new PlexStatsProvider(config);
	}
}
