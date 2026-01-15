<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData, ActionData } from './$types';
	import type { SubtitleProviderConfig } from '$lib/server/subtitles/types';
	import type { ProviderDefinition } from '$lib/server/subtitles/providers/interfaces';

	import { SubtitleProviderTable, SubtitleProviderModal } from '$lib/components/subtitleProviders';
	import { toasts } from '$lib/stores/toast.svelte';

	interface SubtitleProviderFormData {
		name: string;
		implementation: string;
		enabled: boolean;
		priority: number;
		apiKey?: string;
		username?: string;
		password?: string;
		requestsPerMinute: number;
		settings?: Record<string, unknown>;
	}

	interface SubtitleProviderWithDefinition extends SubtitleProviderConfig {
		definitionName?: string;
		definition?: ProviderDefinition;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingProvider = $state<SubtitleProviderWithDefinition | null>(null);
	let saving = $state(false);

	// Test state
	let testingIds = new SvelteSet<string>();

	// Confirmation dialog state
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<SubtitleProviderWithDefinition | null>(null);

	// Sort state
	type SortColumn = 'name' | 'priority' | 'enabled';
	let sort = $state<{ column: SortColumn; direction: 'asc' | 'desc' }>({
		column: 'priority',
		direction: 'asc'
	});

	// Derived: sorted providers
	const sortedProviders = $derived(() => {
		let result = [...data.providers] as SubtitleProviderWithDefinition[];

		result.sort((a, b) => {
			let comparison = 0;
			switch (sort.column) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'priority':
					comparison = a.priority - b.priority;
					break;
				case 'enabled':
					comparison = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
					break;
			}
			return sort.direction === 'asc' ? comparison : -comparison;
		});

		return result;
	});

	// Functions
	function openAddModal() {
		modalMode = 'add';
		editingProvider = null;
		modalOpen = true;
	}

	function openEditModal(provider: SubtitleProviderWithDefinition) {
		modalMode = 'edit';
		editingProvider = provider;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingProvider = null;
	}

	function handleSort(column: SortColumn) {
		if (sort.column === column) {
			sort = { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
		} else {
			sort = { column, direction: 'asc' };
		}
	}

	function confirmDelete(provider: SubtitleProviderWithDefinition) {
		deleteTarget = provider;
		confirmDeleteOpen = true;
	}

	async function handleTest(provider: SubtitleProviderWithDefinition) {
		testingIds.add(provider.id);
		try {
			const response = await fetch('/api/subtitles/providers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					implementation: provider.implementation,
					apiKey: provider.apiKey,
					username: provider.username,
					password: provider.password
				})
			});
			const result = await response.json();
			if (!result.success) {
				toasts.error(`Test failed: ${result.error}`);
			} else {
				toasts.success(`Connection successful! (${result.responseTime}ms)`);
			}
		} catch (e) {
			toasts.error(`Test failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			testingIds.delete(provider.id);
		}
	}

	async function handleModalTest(
		formData: SubtitleProviderFormData
	): Promise<{ success: boolean; error?: string }> {
		try {
			const response = await fetch('/api/subtitles/providers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					implementation: formData.implementation,
					apiKey: formData.apiKey,
					username: formData.username,
					password: formData.password
				})
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(formData: SubtitleProviderFormData) {
		saving = true;
		try {
			const form = new FormData();
			form.append('data', JSON.stringify(formData));

			if (modalMode === 'edit' && editingProvider) {
				form.append('id', editingProvider.id);
				await fetch(`?/updateProvider`, {
					method: 'POST',
					body: form
				});
			} else {
				await fetch(`?/createProvider`, {
					method: 'POST',
					body: form
				});
			}

			await invalidateAll();
			closeModal();
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingProvider) return;
		const form = new FormData();
		form.append('id', editingProvider.id);
		await fetch(`?/deleteProvider`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		closeModal();
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;
		const form = new FormData();
		form.append('id', deleteTarget.id);
		await fetch(`?/deleteProvider`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleReorder(providerIds: string[]) {
		try {
			const response = await fetch('/api/subtitles/providers/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ providerIds })
			});

			if (!response.ok) {
				const error = await response.json();
				console.error('Failed to reorder providers:', error);
				return;
			}

			await invalidateAll();
		} catch (e) {
			console.error('Failed to reorder providers:', e);
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Subtitle Providers</h1>
		<p class="text-base-content/70">
			Configure subtitle providers for automatic subtitle search and download.
		</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Provider
		</button>
	</div>

	{#if form?.providerError}
		<div class="mb-4 alert alert-error">
			<span>{form.providerError}</span>
		</div>
	{/if}

	{#if form?.providerSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-0">
			<SubtitleProviderTable
				providers={sortedProviders()}
				{sort}
				{testingIds}
				onSort={handleSort}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onTest={handleTest}
				onReorder={handleReorder}
			/>
		</div>
	</div>
</div>

<!-- Add/Edit Modal -->
<SubtitleProviderModal
	open={modalOpen}
	mode={modalMode}
	provider={editingProvider}
	definitions={data.definitions}
	{saving}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleModalTest}
/>

<!-- Delete Confirmation Modal -->
{#if confirmDeleteOpen}
	<div class="modal-open modal">
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] break-words">
			<h3 class="text-lg font-bold">Confirm Delete</h3>
			<p class="py-4">
				Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be
				undone.
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => (confirmDeleteOpen = false)}>Cancel</button>
				<button class="btn btn-error" onclick={handleConfirmDelete}>Delete</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={() => (confirmDeleteOpen = false)}
			aria-label="Close modal"
		></button>
	</div>
{/if}
