<script lang="ts">
	import { BarChart3, Play, Database, ExternalLink } from 'lucide-svelte';
	import { SettingsSection } from '$lib/components/ui/settings';

	type BreakdownItem = { label: string; count: number };

	type SyncedItem = {
		id: string;
		title: string;
		seriesName: string | null;
		itemType: string;
		playCount: number | null;
		height: number | null;
		videoCodec: string | null;
		containerFormat: string | null;
		fileSize: number | null;
		lastPlayedDate: string | null;
	};

	interface Props {
		stats: {
			totalPlays: number;
			uniqueItems: number;
			resolutionBreakdown: BreakdownItem[];
			codecBreakdown: BreakdownItem[];
			hdrBreakdown: BreakdownItem[];
			audioCodecBreakdown: BreakdownItem[];
			containerBreakdown: BreakdownItem[];
		};
		topItems: SyncedItem[];
		largestItems: SyncedItem[];
		servers: Array<{ id: string; name: string; serverType: string; enabled: boolean }>;
		totalPlays?: number | null;
		uniqueItems?: number | null;
	}

	let { stats, topItems, largestItems, servers, totalPlays, uniqueItems }: Props = $props();

	function formatBytes(value: number): string {
		if (!value) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = value;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}
		return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function barWidth(count: number, max: number): string {
		if (max <= 0) return '0%';
		return `${Math.max(4, Math.round((count / max) * 100))}%`;
	}

	function maxOf(breakdown: BreakdownItem[]): number {
		if (breakdown.length === 0) return 0;
		return Math.max(...breakdown.map((b) => b.count));
	}
</script>

{#if servers.length === 0}
	<SettingsSection title="No Media Servers Configured" variant="card">
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<BarChart3 class="h-12 w-12 text-base-content/30" />
			<p class="text-base-content/70">
				No media servers configured yet. Add a Jellyfin, Emby, or Plex server from the
				<a href="/settings/integrations" class="link link-primary">Integrations</a>
				page to start tracking stats.
			</p>
		</div>
	</SettingsSection>
{:else if stats.uniqueItems === 0}
	<SettingsSection title="No Playback Data Yet" variant="card">
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<BarChart3 class="h-12 w-12 text-base-content/30" />
			<p class="text-base-content/70">
				Your servers are configured but no stats have been synced. Click "Sync Servers" to pull
				playback and media information from your servers.
			</p>
		</div>
	</SettingsSection>
{:else}
	{#if totalPlays !== null && totalPlays !== undefined && uniqueItems !== null && uniqueItems !== undefined}
		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<div class="card bg-base-200">
				<div class="card-body flex-row items-center gap-4 p-4">
					<div class="rounded-lg bg-secondary/10 p-3">
						<Play class="h-5 w-5 text-secondary" />
					</div>
					<div>
						<div class="text-2xl font-bold">{totalPlays.toLocaleString()}</div>
						<div class="text-xs text-base-content/70">Total Plays</div>
					</div>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body flex-row items-center gap-4 p-4">
					<div class="rounded-lg bg-accent/10 p-3">
						<Database class="h-5 w-5 text-accent" />
					</div>
					<div>
						<div class="text-2xl font-bold">{uniqueItems.toLocaleString()}</div>
						<div class="text-xs text-base-content/70">Items Tracked</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="mt-4 flex justify-end">
		<a href="/settings/general/status/media" class="btn gap-2 btn-ghost btn-sm">
			Explore all media
			<ExternalLink class="h-3.5 w-3.5" />
		</a>
	</div>

	<div class="mt-4 grid gap-4 md:grid-cols-3">
		<SettingsSection title="Resolution" variant="card">
			{#if stats.resolutionBreakdown.length > 0}
				{@const max = maxOf(stats.resolutionBreakdown)}
				<div class="space-y-2">
					{#each stats.resolutionBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-16 text-right text-xs font-medium">{item.label}</span>
							<div class="flex-1">
								<div class="h-6 rounded bg-primary/20">
									<div
										class="h-full rounded bg-primary transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No resolution data available</p>
			{/if}
		</SettingsSection>

		<SettingsSection title="Video Codec" variant="card">
			{#if stats.codecBreakdown.length > 0}
				{@const max = maxOf(stats.codecBreakdown)}
				<div class="space-y-2">
					{#each stats.codecBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-16 truncate text-right text-xs font-medium">{item.label}</span>
							<div class="flex-1">
								<div class="h-6 rounded bg-secondary/20">
									<div
										class="h-full rounded bg-secondary transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No codec data available</p>
			{/if}
		</SettingsSection>

		<SettingsSection title="HDR / SDR" variant="card">
			{#if stats.hdrBreakdown.length > 0}
				{@const max = maxOf(stats.hdrBreakdown)}
				<div class="space-y-2">
					{#each stats.hdrBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-16 text-right text-xs font-medium">{item.label}</span>
							<div class="flex-1">
								<div class="h-6 rounded bg-accent/20">
									<div
										class="h-full rounded bg-accent transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No HDR data available</p>
			{/if}
		</SettingsSection>
	</div>

	<div class="mt-4 grid gap-4 md:grid-cols-2">
		<SettingsSection title="Audio Codec" variant="card">
			{#if stats.audioCodecBreakdown.length > 0}
				{@const max = maxOf(stats.audioCodecBreakdown)}
				<div class="space-y-2">
					{#each stats.audioCodecBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-16 truncate text-right text-xs font-medium">{item.label}</span>
							<div class="flex-1">
								<div class="h-6 rounded bg-info/20">
									<div
										class="h-full rounded bg-info transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No audio codec data available</p>
			{/if}
		</SettingsSection>

		<SettingsSection title="Container Format" variant="card">
			{#if stats.containerBreakdown.length > 0}
				{@const max = maxOf(stats.containerBreakdown)}
				<div class="space-y-2">
					{#each stats.containerBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-16 truncate text-right text-xs font-medium">{item.label}</span>
							<div class="flex-1">
								<div class="h-6 rounded bg-warning/20">
									<div
										class="h-full rounded bg-warning transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No container data available</p>
			{/if}
		</SettingsSection>
	</div>

	{#if topItems.length > 0}
		<SettingsSection title="Top Played Items" variant="card">
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead>
						<tr>
							<th>Title</th>
							<th>Type</th>
							<th>Plays</th>
							<th>Resolution</th>
							<th>Codec</th>
							<th>Last Played</th>
						</tr>
					</thead>
					<tbody>
						{#each topItems as item (item.id)}
							<tr>
								<td>
									<div class="max-w-[200px] truncate font-medium">{item.title}</div>
									{#if item.seriesName}
										<div class="text-xs text-base-content/50">{item.seriesName}</div>
									{/if}
								</td>
								<td>
									<span class="badge badge-ghost badge-sm">{item.itemType}</span>
								</td>
								<td>{item.playCount ?? 0}</td>
								<td>
									{#if item.height}
										<span class="text-xs"
											>{item.height >= 2160
												? '4K'
												: item.height >= 1080
													? '1080p'
													: item.height >= 720
														? '720p'
														: item.height >= 480
															? '480p'
															: 'SD'}</span
										>
									{:else}
										<span class="text-xs text-base-content/40">—</span>
									{/if}
								</td>
								<td>
									{#if item.videoCodec}
										<span class="text-xs">{item.videoCodec}</span>
									{:else}
										<span class="text-xs text-base-content/40">—</span>
									{/if}
								</td>
								<td>
									{#if item.lastPlayedDate}
										<span class="text-xs">{new Date(item.lastPlayedDate).toLocaleDateString()}</span
										>
									{:else}
										<span class="text-xs text-base-content/40">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</SettingsSection>
	{/if}

	{#if largestItems.length > 0}
		<SettingsSection title="Largest Items" variant="card">
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead>
						<tr>
							<th>Title</th>
							<th>Type</th>
							<th>Size</th>
							<th>Resolution</th>
							<th>Container</th>
						</tr>
					</thead>
					<tbody>
						{#each largestItems as item (item.id)}
							<tr>
								<td>
									<div class="max-w-[200px] truncate font-medium">{item.title}</div>
									{#if item.seriesName}
										<div class="text-xs text-base-content/50">{item.seriesName}</div>
									{/if}
								</td>
								<td>
									<span class="badge badge-ghost badge-sm">{item.itemType}</span>
								</td>
								<td>{formatBytes(item.fileSize ?? 0)}</td>
								<td>
									{#if item.height}
										<span class="text-xs"
											>{item.height >= 2160
												? '4K'
												: item.height >= 1080
													? '1080p'
													: item.height >= 720
														? '720p'
														: item.height >= 480
															? '480p'
															: 'SD'}</span
										>
									{:else}
										<span class="text-xs text-base-content/40">—</span>
									{/if}
								</td>
								<td>
									{#if item.containerFormat}
										<span class="text-xs">{item.containerFormat}</span>
									{:else}
										<span class="text-xs text-base-content/40">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</SettingsSection>
	{/if}
{/if}
