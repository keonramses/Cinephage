import { describe, expect, it } from 'vitest';
import { createStatsProvider } from './index.js';
import { JellyfinStatsProvider } from './JellyfinStatsProvider.js';
import { EmbyStatsProvider } from './EmbyStatsProvider.js';
import { PlexStatsProvider } from './PlexStatsProvider.js';
describe('createStatsProvider', () => {
	const baseConfig = {
		host: 'http://localhost:8096',
		apiKey: 'test-key',
		serverId: 'test-server-id'
	};

	it('should create JellyfinStatsProvider for jellyfin type', () => {
		const provider = createStatsProvider({
			...baseConfig,
			serverType: 'jellyfin'
		});
		expect(provider).toBeInstanceOf(JellyfinStatsProvider);
	});

	it('should create EmbyStatsProvider for emby type', () => {
		const provider = createStatsProvider({
			...baseConfig,
			serverType: 'emby'
		});
		expect(provider).toBeInstanceOf(EmbyStatsProvider);
	});

	it('should create PlexStatsProvider for plex type', () => {
		const provider = createStatsProvider({
			...baseConfig,
			serverType: 'plex'
		});
		expect(provider).toBeInstanceOf(PlexStatsProvider);
	});
});
