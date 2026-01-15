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
		Loader2
	} from 'lucide-svelte';
	import QueueStatusBadge from './QueueStatusBadge.svelte';
	import QueueProgressBar from './QueueProgressBar.svelte';
	import QueueItemCard from './QueueItemCard.svelte';

	interface Props {
		items: QueueItemWithMedia[];
		actionInProgress: string | null;
		handleAction: (id: string) => SubmitFunction;
	}

	let { items, actionInProgress, handleAction }: Props = $props();

	// Format ETA
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

	// Get media title and link
	function getMediaInfo(
		item: QueueItemWithMedia
	): { title: string; href: string; type: 'movie' | 'tv' } | null {
		if (item.movie) {
			return {
				title: item.movie.title + (item.movie.year ? ` (${item.movie.year})` : ''),
				href: `/movies/${item.movie.id}`,
				type: 'movie'
			};
		}
		if (item.series) {
			let title = item.series.title + (item.series.year ? ` (${item.series.year})` : '');
			if (item.seasonNumber !== null && item.seasonNumber !== undefined) {
				title += ` - Season ${item.seasonNumber}`;
			}
			return {
				title,
				href: `/tv/${item.series.id}`,
				type: 'tv'
			};
		}
		return null;
	}
</script>

{#if items.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Download class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No downloads in queue</p>
		<p class="mt-1 text-sm">Downloads will appear here when you grab releases</p>
	</div>
{:else}
	<!-- Mobile: Card View -->
	<div class="space-y-3 lg:hidden">
		{#each items as item (item.id)}
			<QueueItemCard {item} {actionInProgress} {handleAction} />
		{/each}
	</div>

	<!-- Desktop: Table View -->
	<div class="hidden overflow-x-auto lg:block">
		<table class="table table-sm">
			<thead>
				<tr>
					<th>Title</th>
					<th>Media</th>
					<th>Status</th>
					<th>Progress</th>
					<th>Size</th>
					<th>Group</th>
					<th>Speed</th>
					<th>ETA</th>
					<th>Client</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const mediaInfo = getMediaInfo(item)}
					<tr class="hover">
						<!-- Release Title -->
						<td>
							<div class="max-w-xs">
								<div class="truncate font-medium" title={item.title}>{item.title}</div>
								{#if item.quality}
									<div class="mt-0.5 flex gap-1 text-xs text-base-content/60">
										{#if item.quality.resolution}
											<span class="badge badge-outline badge-xs">{item.quality.resolution}</span>
										{/if}
										{#if item.quality.source}
											<span class="badge badge-outline badge-xs">{item.quality.source}</span>
										{/if}
										{#if item.quality.codec}
											<span class="badge badge-outline badge-xs">{item.quality.codec}</span>
										{/if}
									</div>
								{/if}
							</div>
						</td>

						<!-- Media Info -->
						<td>
							{#if mediaInfo}
								<a
									href={resolvePath(mediaInfo.href)}
									class="flex items-center gap-2 hover:text-primary"
								>
									{#if mediaInfo.type === 'movie'}
										<Clapperboard class="h-4 w-4 shrink-0" />
									{:else}
										<Tv class="h-4 w-4 shrink-0" />
									{/if}
									<span class="max-w-32 truncate" title={mediaInfo.title}>{mediaInfo.title}</span>
								</a>
							{:else}
								<span class="text-base-content/40">Unknown</span>
							{/if}
						</td>

						<!-- Status -->
						<td>
							<QueueStatusBadge status={item.status} />
							{#if item.errorMessage}
								<div class="mt-1 max-w-32 truncate text-xs text-error" title={item.errorMessage}>
									{item.errorMessage}
								</div>
							{/if}
						</td>

						<!-- Progress -->
						<td class="min-w-32">
							<QueueProgressBar progress={item.progress} status={item.status} />
						</td>

						<!-- Size -->
						<td>
							<span class="text-sm">{formatBytes(item.size)}</span>
						</td>

						<!-- Group -->
						<td>
							<span class="text-sm text-base-content/70">{item.releaseGroup || '-'}</span>
						</td>

						<!-- Speed -->
						<td>
							<div class="flex flex-col text-xs">
								{#if item.status === 'downloading'}
									<span class="flex items-center gap-1 text-info">
										<Download class="h-3 w-3" />
										{formatSpeed(item.downloadSpeed)}
									</span>
								{/if}
								{#if item.status === 'seeding' || (item.status === 'downloading' && item.uploadSpeed > 0)}
									<span class="flex items-center gap-1 text-success">
										<Upload class="h-3 w-3" />
										{formatSpeed(item.uploadSpeed)}
									</span>
								{/if}
								{#if item.status !== 'downloading' && item.status !== 'seeding'}
									<span class="text-base-content/40">-</span>
								{/if}
							</div>
						</td>

						<!-- ETA -->
						<td>
							{#if item.status === 'downloading' && item.eta}
								<span class="flex items-center gap-1 text-sm">
									<Clock class="h-3 w-3" />
									{formatEta(item.eta)}
								</span>
							{:else if item.status === 'seeding'}
								<span class="text-xs text-base-content/60">
									Ratio: {item.ratio.toFixed(2)}
								</span>
							{:else}
								<span class="text-base-content/40">-</span>
							{/if}
						</td>

						<!-- Client -->
						<td>
							{#if item.downloadClient}
								<span class="flex items-center gap-1 text-sm">
									<HardDrive class="h-3 w-3" />
									<span class="max-w-20 truncate" title={item.downloadClient.name}>
										{item.downloadClient.name}
									</span>
								</span>
							{:else}
								<span class="text-base-content/40">-</span>
							{/if}
						</td>

						<!-- Actions -->
						<td>
							<div class="flex justify-end gap-1">
								{#if actionInProgress === item.id}
									<span class="btn btn-disabled btn-ghost btn-sm">
										<Loader2 class="h-4 w-4 animate-spin" />
									</span>
								{:else}
									<!-- Pause/Resume -->
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

									<!-- Retry (for failed items) -->
									{#if item.status === 'failed'}
										<form method="POST" action="?/retry" use:enhance={handleAction(item.id)}>
											<input type="hidden" name="id" value={item.id} />
											<button class="btn btn-ghost btn-sm" title="Retry">
												<RotateCcw class="h-4 w-4" />
											</button>
										</form>
									{/if}

									<!-- Remove -->
									<form method="POST" action="?/remove" use:enhance={handleAction(item.id)}>
										<input type="hidden" name="id" value={item.id} />
										<button class="btn text-error btn-ghost btn-sm" title="Remove">
											<Trash2 class="h-4 w-4" />
										</button>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
