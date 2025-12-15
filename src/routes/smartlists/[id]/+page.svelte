<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		RefreshCw,
		Film,
		Tv,
		Plus,
		Ban,
		Check,
		Loader2,
		Calendar,
		Star,
		TrendingUp,
		Library
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshing = $state(false);
	let addingIds = $state<Set<number>>(new Set());
	let excludingIds = $state<Set<number>>(new Set());
	let bulkAdding = $state(false);

	let filterInLibrary = $state<'all' | 'in' | 'out'>('all');
	let showExcluded = $state(false);

	async function refreshList() {
		refreshing = true;
		try {
			await fetch(`/api/smartlists/${data.list.id}/refresh`, { method: 'POST' });
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	async function addToLibrary(tmdbId: number) {
		addingIds.add(tmdbId);
		addingIds = addingIds;
		try {
			await fetch(`/api/smartlists/${data.list.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'add-to-library', tmdbIds: [tmdbId] })
			});
			await invalidateAll();
		} finally {
			addingIds.delete(tmdbId);
			addingIds = addingIds;
		}
	}

	async function excludeItem(tmdbId: number) {
		excludingIds.add(tmdbId);
		excludingIds = excludingIds;
		try {
			await fetch(`/api/smartlists/${data.list.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'exclude', tmdbIds: [tmdbId] })
			});
			await invalidateAll();
		} finally {
			excludingIds.delete(tmdbId);
			excludingIds = excludingIds;
		}
	}

	async function includeItem(tmdbId: number) {
		excludingIds.add(tmdbId);
		excludingIds = excludingIds;
		try {
			await fetch(`/api/smartlists/${data.list.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'include', tmdbIds: [tmdbId] })
			});
			await invalidateAll();
		} finally {
			excludingIds.delete(tmdbId);
			excludingIds = excludingIds;
		}
	}

	async function addAllToLibrary() {
		if (!confirm('Add all visible items to your library?')) return;
		bulkAdding = true;
		try {
			const tmdbIds = data.items
				.filter((i: (typeof data.items)[0]) => !i.inLibrary && !i.isExcluded)
				.map((i: (typeof data.items)[0]) => i.tmdbId);
			await fetch(`/api/smartlists/${data.list.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'add-to-library', tmdbIds })
			});
			await invalidateAll();
		} finally {
			bulkAdding = false;
		}
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (filterInLibrary === 'in') params.set('inLibrary', 'true');
		else if (filterInLibrary === 'out') params.set('inLibrary', 'false');
		if (showExcluded) params.set('includeExcluded', 'true');

		const queryString = params.toString();
		goto(`/smartlists/${data.list.id}${queryString ? '?' + queryString : ''}`, {
			invalidateAll: true
		});
	}

	function goToPage(page: number) {
		const params = new URLSearchParams(window.location.search);
		params.set('page', String(page));
		goto(`/smartlists/${data.list.id}?${params.toString()}`, { invalidateAll: true });
	}

	const filteredItems = $derived(
		data.items.filter((item: (typeof data.items)[0]) => {
			if (!showExcluded && item.isExcluded) return false;
			return true;
		})
	);
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<a href="/smartlists" class="btn btn-ghost btn-sm gap-1">
			<ArrowLeft class="h-4 w-4" />
			Back to Smart Lists
		</a>
	</div>

	<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-3">
				{#if data.list.mediaType === 'movie'}
					<Film class="h-8 w-8 text-primary" />
				{:else}
					<Tv class="h-8 w-8 text-secondary" />
				{/if}
				<div>
					<h1 class="text-2xl font-bold">{data.list.name}</h1>
					{#if data.list.description}
						<p class="text-base-content/70">{data.list.description}</p>
					{/if}
				</div>
			</div>
			<div class="mt-2 flex flex-wrap gap-2">
				<div class="badge badge-ghost">{data.pagination.totalItems} items</div>
				<div class="badge badge-ghost">{data.list.itemsInLibrary ?? 0} in library</div>
				{#if data.list.autoAddBehavior !== 'disabled'}
					<div class="badge badge-info badge-outline">Auto-add enabled</div>
				{/if}
			</div>
		</div>
		<div class="flex gap-2">
			<button
				class="btn btn-outline btn-sm"
				onclick={refreshList}
				disabled={refreshing}
			>
				<RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
				Refresh
			</button>
			<button
				class="btn btn-primary btn-sm"
				onclick={addAllToLibrary}
				disabled={bulkAdding}
			>
				{#if bulkAdding}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Plus class="h-4 w-4" />
				{/if}
				Add All
			</button>
		</div>
	</div>

	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="join">
			<button
				class="btn btn-sm join-item {filterInLibrary === 'all' ? 'btn-active' : ''}"
				onclick={() => {
					filterInLibrary = 'all';
					applyFilters();
				}}
			>
				All
			</button>
			<button
				class="btn btn-sm join-item {filterInLibrary === 'out' ? 'btn-active' : ''}"
				onclick={() => {
					filterInLibrary = 'out';
					applyFilters();
				}}
			>
				Not in Library
			</button>
			<button
				class="btn btn-sm join-item {filterInLibrary === 'in' ? 'btn-active' : ''}"
				onclick={() => {
					filterInLibrary = 'in';
					applyFilters();
				}}
			>
				In Library
			</button>
		</div>
		<label class="label cursor-pointer gap-2">
			<input
				type="checkbox"
				class="checkbox checkbox-sm"
				bind:checked={showExcluded}
				onchange={applyFilters}
			/>
			<span class="label-text">Show excluded</span>
		</label>
	</div>

	{#if filteredItems.length === 0}
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body items-center text-center">
				<Library class="h-16 w-16 text-base-content/30" />
				<h2 class="card-title">No Items Found</h2>
				<p class="text-base-content/70">
					{#if data.pagination.totalItems === 0}
						This smart list hasn't been refreshed yet or returned no results.
					{:else}
						No items match your current filters.
					{/if}
				</p>
				{#if data.pagination.totalItems === 0}
					<button class="btn btn-primary mt-4" onclick={refreshList} disabled={refreshing}>
						<RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
						Refresh Now
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
			{#each filteredItems as item (item.id)}
				<div class="group relative {item.isExcluded ? 'opacity-50' : ''}">
					<div class="aspect-[2/3] overflow-hidden rounded bg-base-300">
						{#if item.posterPath}
							<img
								src="https://image.tmdb.org/t/p/w185{item.posterPath}"
								alt={item.title}
								class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
								loading="lazy"
							/>
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								{#if data.list.mediaType === 'movie'}
									<Film class="h-8 w-8 text-base-content/30" />
								{:else}
									<Tv class="h-8 w-8 text-base-content/30" />
								{/if}
							</div>
						{/if}

						<!-- Rating badge -->
						{#if item.voteAverage}
							<div class="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
								<Star class="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
								{parseFloat(item.voteAverage).toFixed(1)}
							</div>
						{/if}

						<!-- In library badge -->
						{#if item.inLibrary}
							<div class="absolute left-0.5 top-0.5 rounded bg-success p-0.5">
								<Check class="h-3 w-3 text-success-content" />
							</div>
						{/if}

						<!-- Excluded badge -->
						{#if item.isExcluded}
							<div class="absolute left-0.5 top-0.5 rounded bg-error p-0.5">
								<Ban class="h-3 w-3 text-error-content" />
							</div>
						{/if}

						<!-- Hover actions -->
						<div class="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
							{#if item.isExcluded}
								<button
									class="btn btn-success btn-xs"
									onclick={() => includeItem(item.tmdbId)}
									disabled={excludingIds.has(item.tmdbId)}
									title="Include"
								>
									{#if excludingIds.has(item.tmdbId)}
										<Loader2 class="h-3 w-3 animate-spin" />
									{:else}
										<Check class="h-3 w-3" />
									{/if}
								</button>
							{:else}
								{#if !item.inLibrary}
									<button
										class="btn btn-primary btn-xs"
										onclick={() => addToLibrary(item.tmdbId)}
										disabled={addingIds.has(item.tmdbId)}
										title="Add to library"
									>
										{#if addingIds.has(item.tmdbId)}
											<Loader2 class="h-3 w-3 animate-spin" />
										{:else}
											<Plus class="h-3 w-3" />
										{/if}
									</button>
								{/if}
								<button
									class="btn btn-error btn-xs"
									onclick={() => excludeItem(item.tmdbId)}
									disabled={excludingIds.has(item.tmdbId)}
									title="Exclude"
								>
									{#if excludingIds.has(item.tmdbId)}
										<Loader2 class="h-3 w-3 animate-spin" />
									{:else}
										<Ban class="h-3 w-3" />
									{/if}
								</button>
							{/if}
						</div>
					</div>

					<!-- Title -->
					<div class="mt-1">
						<p class="line-clamp-1 text-xs font-medium" title={item.title}>
							{item.title}
						</p>
						{#if item.year}
							<p class="text-[10px] text-base-content/60">{item.year}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if data.pagination.totalPages > 1}
			<div class="mt-6 flex justify-center">
				<div class="join">
					<button
						class="btn btn-sm join-item"
						disabled={data.pagination.page <= 1}
						onclick={() => goToPage(data.pagination.page - 1)}
					>
						Previous
					</button>
					<button class="btn btn-sm join-item">
						Page {data.pagination.page} of {data.pagination.totalPages}
					</button>
					<button
						class="btn btn-sm join-item"
						disabled={data.pagination.page >= data.pagination.totalPages}
						onclick={() => goToPage(data.pagination.page + 1)}
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>
