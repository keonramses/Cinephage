<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolvePath } from '$lib/utils/routing';
	import { formatBytes, formatSpeed } from '$lib/utils/format';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { QueueItemWithMedia } from '$lib/types/queue';
	import {
		Pause,
		Play,
		Trash2,
		RotateCcw,
		Download,
		Upload,
		Clock,
		Clapperboard,
		Tv,
		HardDrive,
		Loader2,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import QueueStatusBadge from './QueueStatusBadge.svelte';
	import QueueProgressBar from './QueueProgressBar.svelte';

	interface Props {
		item: QueueItemWithMedia;
		actionInProgress: string | null;
		handleAction: (id: string) => SubmitFunction;
	}

	let { item, actionInProgress, handleAction }: Props = $props();

	let isExpanded = $state(false);

	function formatEta(seconds: number | null | undefined): string {
		if (!seconds || seconds <= 0) return '-';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		if (minutes > 0) {
			return `${minutes}m ${secs}s`;
		}
		return `${secs}s`;
	}

	function getMediaInfo(
		queueItem: QueueItemWithMedia
	): { title: string; href: string; type: 'movie' | 'tv' } | null {
		if (queueItem.movie) {
			return {
				title: queueItem.movie.title + (queueItem.movie.year ? ` (${queueItem.movie.year})` : ''),
				href: `/movies/${queueItem.movie.id}`,
				type: 'movie'
			};
		}
		if (queueItem.series) {
			let title =
				queueItem.series.title + (queueItem.series.year ? ` (${queueItem.series.year})` : '');
			if (queueItem.seasonNumber !== null && queueItem.seasonNumber !== undefined) {
				title += ` - S${queueItem.seasonNumber}`;
			}
			return {
				title,
				href: `/tv/${queueItem.series.id}`,
				type: 'tv'
			};
		}
		return null;
	}

	const mediaInfo = $derived(getMediaInfo(item));
</script>

<div class="card bg-base-200">
	<div class="card-body gap-2 p-3">
		<!-- Header: Status + Title + Expand toggle -->
		<div class="flex items-start gap-2">
			<QueueStatusBadge status={item.status} class="shrink-0" />
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium" title={item.title}>{item.title}</p>
				{#if item.quality}
					<div class="mt-0.5 flex flex-wrap gap-1">
						{#if item.quality.resolution}
							<span class="badge badge-outline badge-xs">{item.quality.resolution}</span>
						{/if}
						{#if item.quality.source}
							<span class="badge badge-outline badge-xs">{item.quality.source}</span>
						{/if}
					</div>
				{/if}
			</div>
			<button
				class="btn btn-circle shrink-0 btn-ghost btn-xs"
				onclick={() => (isExpanded = !isExpanded)}
				aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
			>
				{#if isExpanded}
					<ChevronUp class="h-4 w-4" />
				{:else}
					<ChevronDown class="h-4 w-4" />
				{/if}
			</button>
		</div>

		<!-- Progress bar -->
		<QueueProgressBar progress={item.progress} status={item.status} />

		<!-- Speed/ETA row (shown when downloading) -->
		{#if item.status === 'downloading' || item.status === 'seeding'}
			<div class="flex flex-wrap gap-3 text-xs text-base-content/70">
				{#if item.status === 'downloading'}
					<span class="flex items-center gap-1 text-info">
						<Download class="h-3 w-3" />
						{formatSpeed(item.downloadSpeed)}
					</span>
					{#if item.eta}
						<span class="flex items-center gap-1">
							<Clock class="h-3 w-3" />
							{formatEta(item.eta)}
						</span>
					{/if}
				{/if}
				{#if item.status === 'seeding' || (item.status === 'downloading' && item.uploadSpeed > 0)}
					<span class="flex items-center gap-1 text-success">
						<Upload class="h-3 w-3" />
						{formatSpeed(item.uploadSpeed)}
					</span>
				{/if}
				{#if item.status === 'seeding'}
					<span>Ratio: {item.ratio.toFixed(2)}</span>
				{/if}
			</div>
		{/if}

		<!-- Error message -->
		{#if item.errorMessage}
			<p class="text-xs text-error">{item.errorMessage}</p>
		{/if}

		<!-- Expanded details -->
		{#if isExpanded}
			<div class="mt-1 space-y-1.5 border-t border-base-300 pt-2 text-xs text-base-content/70">
				{#if mediaInfo}
					<div class="flex items-center gap-2">
						{#if mediaInfo.type === 'movie'}
							<Clapperboard class="h-3.5 w-3.5 shrink-0" />
						{:else}
							<Tv class="h-3.5 w-3.5 shrink-0" />
						{/if}
						<a href={resolvePath(mediaInfo.href)} class="truncate hover:text-primary">
							{mediaInfo.title}
						</a>
					</div>
				{/if}
				{#if item.size}
					<p>Size: {formatBytes(item.size)}</p>
				{/if}
				{#if item.releaseGroup}
					<p>Group: {item.releaseGroup}</p>
				{/if}
				{#if item.downloadClient}
					<div class="flex items-center gap-1">
						<HardDrive class="h-3.5 w-3.5" />
						<span>{item.downloadClient.name}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Actions -->
		<div class="mt-1 flex justify-end gap-1 border-t border-base-300 pt-2">
			{#if actionInProgress === item.id}
				<span class="btn btn-disabled btn-ghost btn-sm">
					<Loader2 class="h-4 w-4 animate-spin" />
				</span>
			{:else}
				{#if item.status === 'downloading' || item.status === 'seeding'}
					<form method="POST" action="?/pause" use:enhance={handleAction(item.id)}>
						<input type="hidden" name="id" value={item.id} />
						<button class="btn btn-ghost btn-sm" title="Pause">
							<Pause class="h-4 w-4" />
						</button>
					</form>
				{:else if item.status === 'paused'}
					<form method="POST" action="?/resume" use:enhance={handleAction(item.id)}>
						<input type="hidden" name="id" value={item.id} />
						<button class="btn btn-ghost btn-sm" title="Resume">
							<Play class="h-4 w-4" />
						</button>
					</form>
				{/if}

				{#if item.status === 'failed'}
					<form method="POST" action="?/retry" use:enhance={handleAction(item.id)}>
						<input type="hidden" name="id" value={item.id} />
						<button class="btn btn-ghost btn-sm" title="Retry">
							<RotateCcw class="h-4 w-4" />
						</button>
					</form>
				{/if}

				<form method="POST" action="?/remove" use:enhance={handleAction(item.id)}>
					<input type="hidden" name="id" value={item.id} />
					<button class="btn text-error btn-ghost btn-sm" title="Remove">
						<Trash2 class="h-4 w-4" />
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
