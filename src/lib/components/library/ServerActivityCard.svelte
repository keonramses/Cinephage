<script lang="ts">
	import { Play } from 'lucide-svelte';

	interface Props {
		serverStats: Array<{
			serverId: string;
			serverName: string;
			serverType: string;
			playCount: number;
			lastPlayedDate: string | null;
			videoCodec: string | null;
			width: number | null;
			height: number | null;
			isHDR: number | null;
			containerFormat: string | null;
		}>;
		totalPlays: number;
		lastPlayed: string | null;
		lastSynced: string | null;
	}

	let { serverStats, totalPlays, lastPlayed, lastSynced }: Props = $props();

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMinutes = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMinutes < 1) return 'just now';
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getResolutionLabel(width: number | null, height: number | null): string {
		if (!width || !height) return '';
		if (height >= 2160 || width >= 3840) return '4K';
		if (height >= 1080 || width >= 1920) return '1080p';
		if (height >= 720 || width >= 1280) return '720p';
		if (height >= 480) return '480p';
		return `${height}p`;
	}

	function getServerBadgeColor(serverType: string): string {
		switch (serverType) {
			case 'jellyfin':
				return 'badge-primary';
			case 'emby':
				return 'badge-secondary';
			case 'plex':
				return 'badge-accent';
			default:
				return 'badge-ghost';
		}
	}
</script>

{#if totalPlays > 0}
	<div class="rounded-xl bg-base-200 p-4 md:p-6">
		<h3 class="mb-3 flex items-center gap-2 font-semibold">
			<Play class="h-4 w-4" />
			Server Activity
		</h3>
		<div class="space-y-3 text-sm">
			<div class="flex items-center gap-2">
				<span class="text-2xl font-bold">{totalPlays}</span>
				<span class="text-base-content/60">total plays</span>
			</div>

			<div class="space-y-1.5">
				{#each serverStats as stat (stat.serverId)}
					<div class="flex items-center justify-between gap-2">
						<span class="flex items-center gap-2">
							<span class="badge badge-sm {getServerBadgeColor(stat.serverType)}">
								{stat.serverName}
							</span>
						</span>
						<span class="text-base-content/80">{stat.playCount ?? 0} plays</span>
					</div>
				{/each}
			</div>

			{#if lastPlayed}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<span class="text-base-content/60">Last played</span>
					<span>{formatDate(lastPlayed)}</span>
				</div>
			{/if}

			{#each serverStats as stat (stat.serverId)}
				{#if stat.videoCodec || stat.width || stat.containerFormat}
					<div class="text-xs text-base-content/70">
						{#if stat.videoCodec}{stat.videoCodec.toUpperCase()}{/if}
						{#if stat.width && stat.height}
							{getResolutionLabel(stat.width, stat.height)}
						{/if}
						{#if stat.containerFormat}{stat.containerFormat.toUpperCase()}{/if}
						{#if stat.isHDR}
							HDR
						{/if}
						<span class="text-base-content/50">({stat.serverName})</span>
					</div>
				{/if}
			{/each}

			{#if lastSynced}
				<div class="pt-1 text-xs text-base-content/50">
					Synced {formatDate(lastSynced)}
				</div>
			{/if}
		</div>
	</div>
{/if}
