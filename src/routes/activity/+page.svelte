<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { onMount, onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import ActivityTable from '$lib/components/activity/ActivityTable.svelte';
	import ActivityDetailModal from '$lib/components/activity/ActivityDetailModal.svelte';
	import ActivityFilters from '$lib/components/activity/ActivityFilters.svelte';
	import ActiveFilters from '$lib/components/activity/ActiveFilters.svelte';
	import type {
		UnifiedActivity,
		ActivityDetails,
		ActivityFilters as FiltersType
	} from '$lib/types/activity';
	import { Activity, RefreshCw, Loader2 } from 'lucide-svelte';

	let { data } = $props();

	// Local state for activities (for SSE updates)
	let activities = $state<UnifiedActivity[]>([]);
	let total = $state(0);

	// Filter state - initialize from URL/data
	let filters = $state<FiltersType>({
		status: 'all',
		mediaType: 'all',
		protocol: 'all'
	});

	// Sort state
	let sortField = $state('time');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	// Loading states
	let isLoading = $state(false);
	let isLoadingMore = $state(false);

	// SSE connection
	let eventSource: EventSource | null = null;

	let hasInitialized = $state(false);

	// Detail modal state
	let selectedActivity = $state<UnifiedActivity | null>(null);
	let activityDetails = $state<ActivityDetails | null>(null);
	let detailsLoading = $state(false);
	let isModalOpen = $state(false);

	// Update activities when data changes (navigation)
	$effect(() => {
		activities = data.activities;
		total = data.total;
		if (!hasInitialized && data.filters) {
			filters = { ...data.filters };
			hasInitialized = true;
		}
	});

	// Set up SSE connection
	onMount(() => {
		connectSSE();
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
		}
	});

	function connectSSE() {
		eventSource = new EventSource(resolvePath('/api/activity/stream'));

		eventSource.addEventListener('activity:new', (event) => {
			const newActivity = JSON.parse(event.data) as UnifiedActivity;
			// Add to beginning of list
			activities = [newActivity, ...activities.filter((a) => a.id !== newActivity.id)];
			total += 1;
		});

		eventSource.addEventListener('activity:updated', (event) => {
			const updated = JSON.parse(event.data) as Partial<UnifiedActivity>;
			activities = activities.map((a) => (a.id === updated.id ? { ...a, ...updated } : a));
		});

		eventSource.addEventListener('activity:progress', (event) => {
			const { id, progress, status } = JSON.parse(event.data);
			activities = activities.map((a) =>
				a.id === id ? { ...a, downloadProgress: progress, status: status || a.status } : a
			);
		});

		eventSource.onerror = () => {
			// Try to reconnect after a delay
			setTimeout(() => {
				if (eventSource) {
					eventSource.close();
				}
				connectSSE();
			}, 5000);
		};
	}

	// Apply filters via URL navigation
	async function applyFilters(newFilters: FiltersType) {
		filters = newFilters;
		isLoading = true;

		const params = new SvelteURLSearchParams();
		if (filters.status !== 'all') params.set('status', filters.status!);
		if (filters.mediaType !== 'all') params.set('mediaType', filters.mediaType!);
		if (filters.search) params.set('search', filters.search);
		if (filters.protocol !== 'all') params.set('protocol', filters.protocol!);
		if (filters.indexer) params.set('indexer', filters.indexer);
		if (filters.releaseGroup) params.set('releaseGroup', filters.releaseGroup);
		if (filters.resolution) params.set('resolution', filters.resolution);
		if (filters.isUpgrade) params.set('isUpgrade', 'true');
		if (filters.includeNoResults) params.set('includeNoResults', 'true');
		if (filters.downloadClientId) params.set('downloadClientId', filters.downloadClientId);
		if (filters.startDate) params.set('startDate', filters.startDate);
		if (filters.endDate) params.set('endDate', filters.endDate);

		const queryString = params.toString();
		await goto(resolvePath(`/activity${queryString ? `?${queryString}` : ''}`), {
			keepFocus: true
		});
		isLoading = false;
	}

	// Remove a specific filter
	async function removeFilter(key: keyof FiltersType) {
		const newFilters = { ...filters };
		if (key === 'status' || key === 'mediaType' || key === 'protocol') {
			newFilters[key] = 'all';
		} else {
			delete newFilters[key];
		}
		await applyFilters(newFilters);
	}

	// Clear all filters
	async function clearAllFilters() {
		await applyFilters({
			status: 'all',
			mediaType: 'all',
			protocol: 'all'
		});
	}

	// Handle sort
	function handleSort(field: string) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}

		// Sort locally
		activities = [...activities].sort((a, b) => {
			let aVal: string | number | null = null;
			let bVal: string | number | null = null;

			switch (field) {
				case 'time':
					aVal = a.startedAt;
					bVal = b.startedAt;
					break;
				case 'media':
					aVal = a.mediaTitle.toLowerCase();
					bVal = b.mediaTitle.toLowerCase();
					break;
				case 'size':
					aVal = a.size || 0;
					bVal = b.size || 0;
					break;
				case 'status':
					aVal = a.status;
					bVal = b.status;
					break;
				case 'release':
					aVal = a.releaseTitle?.toLowerCase() || '';
					bVal = b.releaseTitle?.toLowerCase() || '';
					break;
			}

			if (aVal === null || bVal === null) return 0;
			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	}

	// Load more
	async function loadMore() {
		if (isLoadingMore || !data.hasMore) return;
		isLoadingMore = true;

		try {
			const apiUrl = new URL('/api/activity', window.location.origin);
			apiUrl.searchParams.set('limit', '50');
			apiUrl.searchParams.set('offset', String(activities.length));
			if (filters.status !== 'all') apiUrl.searchParams.set('status', filters.status!);
			if (filters.mediaType !== 'all') apiUrl.searchParams.set('mediaType', filters.mediaType!);
			if (filters.search) apiUrl.searchParams.set('search', filters.search);
			if (filters.protocol !== 'all') apiUrl.searchParams.set('protocol', filters.protocol!);
			if (filters.indexer) apiUrl.searchParams.set('indexer', filters.indexer);
			if (filters.releaseGroup) apiUrl.searchParams.set('releaseGroup', filters.releaseGroup);
			if (filters.resolution) apiUrl.searchParams.set('resolution', filters.resolution);
			if (filters.isUpgrade) apiUrl.searchParams.set('isUpgrade', 'true');
			if (filters.includeNoResults) apiUrl.searchParams.set('includeNoResults', 'true');
			if (filters.downloadClientId)
				apiUrl.searchParams.set('downloadClientId', filters.downloadClientId);
			if (filters.startDate) apiUrl.searchParams.set('startDate', filters.startDate);
			if (filters.endDate) apiUrl.searchParams.set('endDate', filters.endDate);

			const response = await fetch(apiUrl.toString());
			const result = await response.json();

			if (result.success && result.activities) {
				activities = [...activities, ...result.activities];
			}
		} catch (error) {
			console.error('Failed to load more:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	// Refresh data
	async function refresh() {
		isLoading = true;
		await invalidateAll();
		isLoading = false;
	}

	// Open detail modal
	async function openDetailModal(activity: UnifiedActivity) {
		selectedActivity = activity;
		isModalOpen = true;
		detailsLoading = true;
		activityDetails = null;

		// Fetch activity details
		try {
			const response = await fetch(`/api/activity/${activity.id}/details`);
			if (response.ok) {
				const data = await response.json();
				activityDetails = data.details;
			}
		} catch (error) {
			console.error('Failed to fetch activity details:', error);
		}

		detailsLoading = false;
	}

	function closeModal() {
		isModalOpen = false;
		selectedActivity = null;
		activityDetails = null;
	}

	// Queue actions
	async function handlePause(id: string) {
		const response = await fetch(`/api/queue/${id}/pause`, { method: 'POST' });
		if (!response.ok) throw new Error('Failed to pause');
		await invalidateAll();
	}

	async function handleResume(id: string) {
		const response = await fetch(`/api/queue/${id}/resume`, { method: 'POST' });
		if (!response.ok) throw new Error('Failed to resume');
		await invalidateAll();
	}

	async function handleRemove(id: string) {
		const response = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
		if (!response.ok) throw new Error('Failed to remove');
		await invalidateAll();
		closeModal();
	}

	async function handleRetry(id: string) {
		const response = await fetch(`/api/queue/${id}/retry`, { method: 'POST' });
		if (!response.ok) throw new Error('Failed to retry');
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Activity - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="flex items-center gap-2 text-3xl font-bold">
				<Activity class="h-8 w-8" />
				Activity
			</h1>
			<p class="text-base-content/70">Download and search history</p>
		</div>
		<button class="btn btn-ghost btn-sm" onclick={refresh} disabled={isLoading}>
			<RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
			Refresh
		</button>
	</div>

	<!-- Filters Component -->
	<ActivityFilters
		{filters}
		filterOptions={data.filterOptions}
		onFiltersChange={applyFilters}
		onClearFilters={clearAllFilters}
	/>

	<!-- Active Filters Display -->
	<ActiveFilters {filters} onFilterRemove={removeFilter} onClearAll={clearAllFilters} />

	<!-- Activity Stats -->
	<div class="flex items-center gap-4 text-sm text-base-content/70">
		<span>{total} activities</span>
		{#if activities.some((a) => a.status === 'downloading')}
			<span class="badge gap-1 badge-info">
				<Loader2 class="h-3 w-3 animate-spin" />
				{activities.filter((a) => a.status === 'downloading').length} downloading
			</span>
		{/if}
	</div>

	<!-- Activity Table -->
	{#if isLoading && activities.length === 0}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin" />
		</div>
	{:else}
		<ActivityTable
			{activities}
			{sortField}
			{sortDirection}
			onSort={handleSort}
			onRowClick={openDetailModal}
		/>

		<!-- Load More -->
		{#if data.hasMore}
			<div class="flex justify-center py-4">
				<button class="btn btn-ghost" onclick={loadMore} disabled={isLoadingMore}>
					{#if isLoadingMore}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Load More
				</button>
			</div>
		{/if}
	{/if}
</div>

<!-- Detail Modal -->
{#if isModalOpen && selectedActivity}
	<ActivityDetailModal
		activity={selectedActivity}
		details={activityDetails}
		loading={detailsLoading}
		onClose={closeModal}
		onPause={handlePause}
		onResume={handleResume}
		onRemove={handleRemove}
		onRetry={handleRetry}
	/>
{/if}
