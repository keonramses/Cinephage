<script lang="ts">
	import type { HistoryItemWithMedia, HistoryStatus } from '$lib/types/queue';
	import {
		History,
		Clapperboard,
		Tv,
		CheckCircle2,
		AlertCircle,
		XCircle,
		Trash2
	} from 'lucide-svelte';
	import { resolvePath } from '$lib/utils/routing';
	import { formatBytes } from '$lib/utils/format';
	import HistoryItemCard from './HistoryItemCard.svelte';

	interface Props {
		items: HistoryItemWithMedia[];
	}

	let { items }: Props = $props();

	// Format date
	function formatDate(dateString: string | null | undefined): string {
		if (!dateString) return '-';
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Status badge config
	const statusConfig: Record<
		HistoryStatus,
		{ label: string; variant: string; icon: typeof CheckCircle2 }
	> = {
		imported: { label: 'Imported', variant: 'badge-success', icon: CheckCircle2 },
		streaming: { label: 'Streaming', variant: 'badge-info', icon: CheckCircle2 },
		failed: { label: 'Failed', variant: 'badge-error', icon: AlertCircle },
		rejected: { label: 'Rejected', variant: 'badge-warning', icon: XCircle },
		removed: { label: 'Removed', variant: 'badge-ghost', icon: Trash2 }
	};

	// Get media info
	function getMediaInfo(
		item: HistoryItemWithMedia
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
		<History class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No download history</p>
		<p class="mt-1 text-sm">Completed and removed downloads will appear here</p>
	</div>
{:else}
	<!-- Mobile: Card View -->
	<div class="space-y-3 lg:hidden">
		{#each items as item (item.id)}
			<HistoryItemCard {item} />
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
					<th>Size</th>
					<th>Group</th>
					<th>Indexer</th>
					<th>Grabbed</th>
					<th>Completed</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const mediaInfo = getMediaInfo(item)}
					{@const config = statusConfig[item.status] || statusConfig.removed}
					{@const Icon = config.icon}
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
							<span class="badge gap-1 {config.variant}">
								<Icon class="h-3 w-3" />
								{config.label}
							</span>
							{#if item.statusReason}
								<div
									class="mt-1 max-w-32 truncate text-xs text-base-content/60"
									title={item.statusReason}
								>
									{item.statusReason}
								</div>
							{/if}
						</td>

						<!-- Size -->
						<td>
							<span class="text-sm">{formatBytes(item.size)}</span>
						</td>

						<!-- Group -->
						<td>
							<span class="text-sm text-base-content/70">{item.releaseGroup || '-'}</span>
						</td>

						<!-- Indexer -->
						<td>
							<span class="text-sm">{item.indexerName || '-'}</span>
						</td>

						<!-- Grabbed At -->
						<td>
							<span class="text-sm">{formatDate(item.grabbedAt)}</span>
						</td>

						<!-- Completed At -->
						<td>
							<span class="text-sm"
								>{formatDate(item.importedAt || item.completedAt || item.createdAt)}</span
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
