<script lang="ts">
	import { AlertCircle, Check, ChevronLeft, ChevronRight, RefreshCw, Star, Image } from 'lucide-svelte';

	interface PreviewItem {
		id: number;
		title?: string;
		name?: string;
		poster_path: string | null;
		vote_average: number;
		release_date?: string;
		first_air_date?: string;
		overview?: string;
		inLibrary?: boolean;
	}

	interface Props {
		items: PreviewItem[];
		loading: boolean;
		error: string | null;
		page: number;
		totalResults: number;
		totalPages: number;
		mediaType: 'movie' | 'tv';
		itemLimit: number;
		unfilteredTotal: number;
		onPageChange: (page: number) => void;
		onRetry: () => void;
	}

	let {
		items,
		loading,
		error,
		page,
		totalResults,
		totalPages,
		mediaType,
		itemLimit,
		unfilteredTotal,
		onPageChange,
		onRetry
	}: Props = $props();

	const isLimited = $derived(unfilteredTotal > itemLimit);

	function getTitle(item: PreviewItem): string {
		return item.title ?? item.name ?? 'Unknown';
	}

	function getYear(item: PreviewItem): string {
		const date = item.release_date ?? item.first_air_date;
		if (!date) return '';
		return date.substring(0, 4);
	}

	function getPosterUrl(path: string | null): string {
		if (!path) return '';
		return `https://image.tmdb.org/t/p/w185${path}`;
	}

	const mediaLabel = $derived(mediaType === 'movie' ? 'movies' : 'TV shows');
</script>

<div class="card h-full bg-base-100 shadow-xl">
	<div class="card-body p-4">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<h2 class="card-title text-lg">
				Preview
				{#if !loading && !error}
					{#if isLimited}
						<span class="badge badge-ghost">{totalResults.toLocaleString()} of {unfilteredTotal.toLocaleString()} {mediaLabel}</span>
						<span class="badge badge-outline badge-sm">limited to {itemLimit}</span>
					{:else}
						<span class="badge badge-ghost">{totalResults.toLocaleString()} {mediaLabel}</span>
					{/if}
				{/if}
			</h2>
			{#if loading}
				<RefreshCw class="h-5 w-5 animate-spin text-base-content/50" />
			{/if}
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto">
			{#if error}
				<div class="flex h-64 flex-col items-center justify-center gap-4">
					<AlertCircle class="h-12 w-12 text-error" />
					<p class="text-center text-base-content/70">{error}</p>
					<button class="btn btn-ghost btn-sm" onclick={onRetry}>
						<RefreshCw class="h-4 w-4" />
						Retry
					</button>
				</div>
			{:else if loading && items.length === 0}
				<!-- Loading skeleton -->
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
					{#each Array(12) as _}
						<div class="animate-pulse">
							<div class="aspect-[2/3] rounded bg-base-300"></div>
							<div class="mt-1 h-3 w-3/4 rounded bg-base-300"></div>
						</div>
					{/each}
				</div>
			{:else if items.length === 0}
				<div class="flex h-64 flex-col items-center justify-center">
					<p class="text-center text-base-content/50">
						No {mediaLabel} match your filters.<br />
						Try adjusting your criteria.
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
					{#each items as item (item.id)}
						<div class="group relative">
							<!-- Poster -->
							<div class="aspect-[2/3] overflow-hidden rounded bg-base-300">
								{#if item.poster_path}
									<img
										src={getPosterUrl(item.poster_path)}
										alt={getTitle(item)}
										class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
										loading="lazy"
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<Image class="h-8 w-8 text-base-content/30" />
									</div>
								{/if}

								<!-- Rating badge -->
								{#if item.vote_average > 0}
									<div class="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
										<Star class="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
										{item.vote_average.toFixed(1)}
									</div>
								{/if}

								<!-- In library overlay -->
								{#if item.inLibrary}
									<div class="absolute inset-0 flex items-center justify-center bg-success/40" title="In library">
										<div class="rounded-full bg-success p-1.5 shadow-lg">
											<Check class="h-5 w-5 text-success-content" />
										</div>
									</div>
								{/if}
							</div>

							<!-- Title -->
							<div class="mt-1">
								<p class="line-clamp-1 text-xs font-medium" title={getTitle(item)}>
									{getTitle(item)}
								</p>
								{#if getYear(item)}
									<p class="text-[10px] text-base-content/60">{getYear(item)}</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1 && !error}
			<div class="mt-4 flex items-center justify-between border-t border-base-300 pt-4">
				<button
					class="btn btn-ghost btn-sm"
					onclick={() => onPageChange(page - 1)}
					disabled={page <= 1 || loading}
				>
					<ChevronLeft class="h-4 w-4" />
					Previous
				</button>

				<span class="text-sm text-base-content/70">
					Page {page} of {totalPages}
				</span>

				<button
					class="btn btn-ghost btn-sm"
					onclick={() => onPageChange(page + 1)}
					disabled={page >= totalPages || loading}
				>
					Next
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
		{/if}
	</div>
</div>
