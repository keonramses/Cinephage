<script lang="ts">
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { X, Loader2, Search, Tv, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import type {
		StalkerAccount,
		CachedCategory,
		CachedChannel,
		PaginatedChannelResponse
	} from '$lib/types/livetv';

	type BrowserMode = 'add-to-lineup' | 'select-backup';

	interface Props {
		open: boolean;
		lineupChannelIds: Set<string>;
		onClose: () => void;
		onChannelsAdded: () => void;
		// Backup selection mode props
		mode?: BrowserMode;
		lineupItemId?: string; // The lineup item we're adding backup for
		excludeChannelId?: string; // The primary channel to exclude from selection
		onBackupSelected?: (accountId: string, channelId: string) => void;
	}

	let {
		open,
		lineupChannelIds,
		onClose,
		onChannelsAdded,
		mode = 'add-to-lineup',
		lineupItemId,
		excludeChannelId,
		onBackupSelected
	}: Props = $props();

	// Derived mode checks
	const isBackupMode = $derived(mode === 'select-backup');

	// Data state
	let accounts = $state<StalkerAccount[]>([]);
	let stalkerCategories = $state<CachedCategory[]>([]);
	let channels = $state<CachedChannel[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Filter state
	let selectedAccountId = $state('');
	let selectedCategoryId = $state('');
	let searchQuery = $state('');
	let debouncedSearch = $state('');

	// Pagination state
	let page = $state(1);
	let pageSize = $state(50);
	let total = $state(0);
	let totalPages = $state(0);

	// Selection state
	let selectedIds = new SvelteSet<string>();
	let addingIds = new SvelteSet<string>();
	let bulkAdding = $state(false);

	// Local copy of lineup IDs (updated after successful adds)
	let localLineupIds = new SvelteSet<string>();

	// Track modal open state for transition detection
	let wasOpen = $state(false);

	// Debounce timer
	let searchDebounceTimer: ReturnType<typeof setTimeout>;

	// Backup selection state
	let addingBackup = $state(false);

	// Derived
	// In backup mode, only exclude the primary channel; in lineup mode, exclude already-added channels
	const isExcluded = (channelId: string) => {
		if (isBackupMode) {
			return channelId === excludeChannelId;
		}
		return localLineupIds.has(channelId);
	};

	// Legacy alias for lineup mode
	const isInLineup = (channelId: string) => localLineupIds.has(channelId);

	const selectableChannels = $derived(channels.filter((c) => !isExcluded(c.id)));

	const allVisibleSelected = $derived(
		selectableChannels.length > 0 && selectableChannels.every((c) => selectedIds.has(c.id))
	);

	const someVisibleSelected = $derived(
		selectableChannels.some((c) => selectedIds.has(c.id)) && !allVisibleSelected
	);

	// Reset state only when modal OPENS (transition from closed to open)
	$effect(() => {
		const justOpened = open && !wasOpen;
		wasOpen = open;

		if (justOpened) {
			selectedIds = new SvelteSet();
			selectedAccountId = '';
			selectedCategoryId = '';
			searchQuery = '';
			debouncedSearch = '';
			page = 1;
			error = null;
			localLineupIds = new SvelteSet(lineupChannelIds);
			loadAccounts();
			loadChannels();
		}
	});

	// Sync lineup IDs from parent without resetting filters
	$effect(() => {
		if (open && wasOpen) {
			localLineupIds = new SvelteSet(lineupChannelIds);
		}
	});

	// Debounce search input
	$effect(() => {
		const query = searchQuery; // Read synchronously to track as dependency
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			if (debouncedSearch !== query) {
				debouncedSearch = query;
				page = 1;
			}
		}, 300);
	});

	// Reload categories when account changes
	$effect(() => {
		if (open) {
			if (selectedAccountId) {
				loadCategories(selectedAccountId);
			} else {
				stalkerCategories = [];
				selectedCategoryId = '';
			}
		}
	});

	// Reload channels when filters or page changes
	$effect(() => {
		if (open) {
			// Dependencies: selectedAccountId, selectedCategoryId, debouncedSearch, page
			void selectedAccountId;
			void selectedCategoryId;
			void debouncedSearch;
			void page;
			loadChannels();
		}
	});

	async function loadAccounts() {
		try {
			const response = await fetch('/api/livetv/accounts');
			if (response.ok) {
				const data: StalkerAccount[] = await response.json();
				accounts = data.filter((a) => a.enabled);
			}
		} catch (e) {
			console.error('Failed to load accounts:', e);
		}
	}

	async function loadCategories(accountId: string) {
		try {
			const response = await fetch(`/api/livetv/categories?accountIds=${accountId}`);
			if (response.ok) {
				const data = await response.json();
				stalkerCategories = data.categories || [];
				selectedCategoryId = '';
			}
		} catch (e) {
			console.error('Failed to load categories:', e);
			stalkerCategories = [];
		}
	}

	async function loadChannels() {
		loading = true;
		error = null;

		const params = new SvelteURLSearchParams();
		params.set('page', String(page));
		params.set('pageSize', String(pageSize));

		if (selectedAccountId) {
			params.set('accountIds', selectedAccountId);
		}
		if (selectedCategoryId) {
			params.set('categoryIds', selectedCategoryId);
		}
		if (debouncedSearch) {
			params.set('search', debouncedSearch);
		}

		try {
			const response = await fetch(`/api/livetv/channels?${params}`);
			if (!response.ok) throw new Error('Failed to load channels');

			const data: PaginatedChannelResponse = await response.json();
			channels = data.items;
			total = data.total;
			totalPages = data.totalPages;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load channels';
			channels = [];
		} finally {
			loading = false;
		}
	}

	function toggleSelection(channelId: string) {
		if (isInLineup(channelId)) return;

		const newSet = new SvelteSet(selectedIds);
		if (newSet.has(channelId)) {
			newSet.delete(channelId);
		} else {
			newSet.add(channelId);
		}
		selectedIds = newSet;
	}

	function toggleAllVisible() {
		const newSet = new SvelteSet(selectedIds);
		if (allVisibleSelected) {
			// Deselect all visible
			for (const channel of selectableChannels) {
				newSet.delete(channel.id);
			}
		} else {
			// Select all visible
			for (const channel of selectableChannels) {
				newSet.add(channel.id);
			}
		}
		selectedIds = newSet;
	}

	function clearSelection() {
		selectedIds = new SvelteSet();
	}

	async function addSingleChannel(channel: CachedChannel) {
		if (isInLineup(channel.id) || addingIds.has(channel.id)) return;

		const newAddingIds = new SvelteSet(addingIds);
		newAddingIds.add(channel.id);
		addingIds = newAddingIds;

		try {
			const response = await fetch('/api/livetv/lineup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					channels: [{ accountId: channel.accountId, channelId: channel.id }]
				})
			});

			if (!response.ok) throw new Error('Failed to add channel');

			// Update local state for immediate feedback
			localLineupIds = new SvelteSet(localLineupIds).add(channel.id);

			// Remove from selection if selected
			if (selectedIds.has(channel.id)) {
				const newSelectedIds = new SvelteSet(selectedIds);
				newSelectedIds.delete(channel.id);
				selectedIds = newSelectedIds;
			}

			onChannelsAdded();
		} catch (e) {
			console.error('Failed to add channel:', e);
		} finally {
			const updatedAddingIds = new SvelteSet(addingIds);
			updatedAddingIds.delete(channel.id);
			addingIds = updatedAddingIds;
		}
	}

	async function addSelectedChannels() {
		if (selectedIds.size === 0 || bulkAdding) return;

		bulkAdding = true;

		const channelsToAdd = channels
			.filter((c) => selectedIds.has(c.id))
			.map((c) => ({ accountId: c.accountId, channelId: c.id }));

		try {
			const response = await fetch('/api/livetv/lineup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channels: channelsToAdd })
			});

			if (!response.ok) throw new Error('Failed to add channels');

			// Update local state
			const newLocalLineupIds = new SvelteSet(localLineupIds);
			for (const id of selectedIds) {
				newLocalLineupIds.add(id);
			}
			localLineupIds = newLocalLineupIds;

			selectedIds = new SvelteSet();
			onChannelsAdded();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add channels';
		} finally {
			bulkAdding = false;
		}
	}

	// Add a channel as backup (backup mode only)
	async function selectAsBackup(channel: CachedChannel) {
		if (!lineupItemId || !onBackupSelected || addingBackup) return;
		if (channel.id === excludeChannelId) return;

		addingBackup = true;
		try {
			const response = await fetch(`/api/livetv/lineup/${lineupItemId}/backups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accountId: channel.accountId,
					channelId: channel.id
				})
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to add backup');
			}

			onBackupSelected(channel.accountId, channel.id);
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add backup';
		} finally {
			addingBackup = false;
		}
	}

	function handleFilterChange() {
		page = 1;
		selectedIds = new SvelteSet();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box flex max-h-[90vh] max-w-5xl flex-col">
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h3 class="text-lg font-bold">
						{isBackupMode ? 'Select Backup Channel' : 'Browse Channels'}
					</h3>
					<p class="text-sm text-base-content/60">
						{isBackupMode
							? 'Select an alternative channel source'
							: 'Add channels from your Stalker accounts'}
					</p>
				</div>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Filters Row -->
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<!-- Account Filter -->
				<select
					class="select-bordered select w-48 select-sm"
					bind:value={selectedAccountId}
					onchange={handleFilterChange}
				>
					<option value="">All Accounts</option>
					{#each accounts as account (account.id)}
						<option value={account.id}>
							{account.name}
							{#if account.channelCount}({account.channelCount.toLocaleString()}){/if}
						</option>
					{/each}
				</select>

				<!-- Category Filter -->
				<select
					class="select-bordered select w-48 select-sm"
					bind:value={selectedCategoryId}
					onchange={handleFilterChange}
					disabled={!selectedAccountId}
				>
					<option value="">All Categories</option>
					{#each stalkerCategories as category (category.id)}
						<option value={category.id}>
							{category.title}
							({category.channelCount})
						</option>
					{/each}
				</select>

				<!-- Search Input -->
				<div class="relative flex-1">
					<Search
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
					/>
					<input
						type="text"
						placeholder="Search channels..."
						class="input-bordered input input-sm w-full pl-9"
						bind:value={searchQuery}
					/>
				</div>
			</div>

			<!-- Results Summary & Bulk Actions -->
			<div class="mb-2 flex items-center justify-between">
				<span class="text-sm text-base-content/60">
					{total.toLocaleString()} channel{total !== 1 ? 's' : ''}
					{#if !isBackupMode && selectedIds.size > 0}
						<span class="text-primary">({selectedIds.size} selected)</span>
					{/if}
				</span>

				{#if !isBackupMode}
					{#if selectedIds.size > 0}
						<div class="flex gap-2">
							<button class="btn btn-ghost btn-xs" onclick={clearSelection}>Clear</button>
							<button
								class="btn btn-sm btn-primary"
								onclick={addSelectedChannels}
								disabled={bulkAdding}
							>
								{#if bulkAdding}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<Plus class="h-4 w-4" />
								{/if}
								Add {selectedIds.size} Selected
							</button>
						</div>
					{:else if selectableChannels.length > 0}
						<button class="btn btn-ghost btn-xs" onclick={toggleAllVisible}>
							Select All Visible
						</button>
					{/if}
				{/if}
			</div>

			<!-- Error Display -->
			{#if error}
				<div class="mb-2 alert alert-error">
					<span>{error}</span>
					<button class="btn btn-ghost btn-xs" onclick={loadChannels}>Retry</button>
				</div>
			{/if}

			<!-- Channel List -->
			<div class="flex-1 overflow-auto rounded-lg border border-base-300">
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<Loader2 class="h-8 w-8 animate-spin text-primary" />
					</div>
				{:else if channels.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
						<Tv class="mb-4 h-12 w-12" />
						<p>No channels found</p>
						{#if debouncedSearch || selectedAccountId || selectedCategoryId}
							<p class="text-sm">Try adjusting your filters</p>
						{/if}
					</div>
				{:else}
					<table class="table table-sm">
						<thead class="sticky top-0 z-10 bg-base-200">
							<tr>
								{#if !isBackupMode}
									<th class="w-10">
										<input
											type="checkbox"
											class="checkbox checkbox-sm"
											checked={allVisibleSelected}
											indeterminate={someVisibleSelected}
											disabled={selectableChannels.length === 0}
											onchange={toggleAllVisible}
										/>
									</th>
								{/if}
								<th>Channel</th>
								<th>Category</th>
								<th>Account</th>
								<th class="w-24">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each channels as channel (channel.id)}
								{@const excluded = isExcluded(channel.id)}
								{@const inLineup = isInLineup(channel.id)}
								{@const isSelected = selectedIds.has(channel.id)}
								{@const isAdding = addingIds.has(channel.id)}

								<tr class={excluded ? 'bg-base-200/50 opacity-50' : ''}>
									{#if !isBackupMode}
										<td>
											<input
												type="checkbox"
												class="checkbox checkbox-sm"
												checked={isSelected}
												disabled={inLineup}
												onchange={() => toggleSelection(channel.id)}
											/>
										</td>
									{/if}
									<td>
										<div class="flex items-center gap-3">
											{#if channel.logo}
												<img
													src={channel.logo}
													alt=""
													class="h-8 w-8 rounded bg-base-200 object-contain"
												/>
											{:else}
												<div class="flex h-8 w-8 items-center justify-center rounded bg-base-200">
													<Tv class="h-4 w-4 text-base-content/30" />
												</div>
											{/if}
											<div>
												<p class="font-medium">{channel.name}</p>
												{#if channel.number}
													<p class="text-xs text-base-content/50">#{channel.number}</p>
												{/if}
											</div>
										</div>
									</td>
									<td class="text-sm">{channel.categoryTitle || '-'}</td>
									<td class="text-sm">{channel.accountName || '-'}</td>
									<td>
										{#if isBackupMode}
											{#if excluded}
												<span class="badge badge-ghost badge-sm">Primary</span>
											{:else}
												<button
													class="btn btn-ghost btn-xs"
													onclick={() => selectAsBackup(channel)}
													disabled={addingBackup}
												>
													{#if addingBackup}
														<Loader2 class="h-3 w-3 animate-spin" />
													{:else}
														<Plus class="h-3 w-3" />
													{/if}
													Select
												</button>
											{/if}
										{:else if inLineup}
											<span class="badge gap-1 badge-ghost badge-sm">
												<Check class="h-3 w-3" />
												Added
											</span>
										{:else}
											<button
												class="btn btn-ghost btn-xs"
												onclick={() => addSingleChannel(channel)}
												disabled={isAdding}
											>
												{#if isAdding}
													<Loader2 class="h-3 w-3 animate-spin" />
												{:else}
													<Plus class="h-3 w-3" />
												{/if}
												Add
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="mt-4 flex items-center justify-center gap-2">
					<button
						class="btn btn-ghost btn-sm"
						disabled={page === 1 || loading}
						onclick={() => (page = page - 1)}
					>
						<ChevronLeft class="h-4 w-4" />
						Previous
					</button>
					<span class="text-sm">
						Page {page} of {totalPages}
					</span>
					<button
						class="btn btn-ghost btn-sm"
						disabled={page === totalPages || loading}
						onclick={() => (page = page + 1)}
					>
						Next
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
			{/if}

			<!-- Footer -->
			<div class="modal-action">
				<button class="btn" onclick={onClose}>Done</button>
			</div>
		</div>

		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
