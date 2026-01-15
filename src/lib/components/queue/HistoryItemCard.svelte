<script lang="ts">
	import type { HistoryItemWithMedia, HistoryStatus } from '$lib/types/queue';
	import {
		Clapperboard,
		Tv,
		CheckCircle2,
		AlertCircle,
		XCircle,
		Trash2,
		ChevronDown,
		ChevronUp,
		Calendar
	} from 'lucide-svelte';
	import { resolvePath } from '$lib/utils/routing';
	import { formatBytes } from '$lib/utils/format';

	interface Props {
		item: HistoryItemWithMedia;
	}

	let { item }: Props = $props();

	let isExpanded = $state(false);

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

	function getMediaInfo(
		historyItem: HistoryItemWithMedia
	): { title: string; href: string; type: 'movie' | 'tv' } | null {
		if (historyItem.movie) {
			return {
				title:
					historyItem.movie.title + (historyItem.movie.year ? ` (${historyItem.movie.year})` : ''),
				href: `/movies/${historyItem.movie.id}`,
				type: 'movie'
			};
		}
		if (historyItem.series) {
			let title =
				historyItem.series.title + (historyItem.series.year ? ` (${historyItem.series.year})` : '');
			if (historyItem.seasonNumber !== null && historyItem.seasonNumber !== undefined) {
				title += ` - S${historyItem.seasonNumber}`;
			}
			return {
				title,
				href: `/tv/${historyItem.series.id}`,
				type: 'tv'
			};
		}
		return null;
	}

	const config = $derived(statusConfig[item.status] || statusConfig.removed);
	const Icon = $derived(config.icon);
	const mediaInfo = $derived(getMediaInfo(item));
	const completedDate = $derived(item.importedAt || item.completedAt || item.createdAt);
</script>

<div class="card bg-base-200">
	<div class="card-body gap-2 p-3">
		<!-- Header: Status + Title + Expand toggle -->
		<div class="flex items-start gap-2">
			<span class="badge shrink-0 gap-1 {config.variant}">
				<Icon class="h-3 w-3" />
				{config.label}
			</span>
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

		<!-- Completed date -->
		<div class="flex items-center gap-1 text-xs text-base-content/70">
			<Calendar class="h-3 w-3" />
			<span>{formatDate(completedDate)}</span>
		</div>

		<!-- Status reason if any -->
		{#if item.statusReason}
			<p class="text-xs text-base-content/60">{item.statusReason}</p>
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
				{#if item.indexerName}
					<p>Indexer: {item.indexerName}</p>
				{/if}
				{#if item.grabbedAt}
					<p>Grabbed: {formatDate(item.grabbedAt)}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
