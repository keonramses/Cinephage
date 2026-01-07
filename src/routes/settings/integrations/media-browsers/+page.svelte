<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import type {
		MediaBrowserServerPublic,
		MediaBrowserTestResult,
		MediaBrowserPathMapping
	} from '$lib/server/notifications/mediabrowser/types';

	import { MediaBrowserModal, MediaBrowserTable } from '$lib/components/mediaBrowsers';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	interface MediaBrowserFormData {
		name: string;
		serverType: 'jellyfin' | 'emby';
		host: string;
		apiKey: string;
		enabled: boolean;
		onImport: boolean;
		onUpgrade: boolean;
		onRename: boolean;
		onDelete: boolean;
		pathMappings: MediaBrowserPathMapping[];
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingServer = $state<MediaBrowserServerPublic | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<MediaBrowserServerPublic | null>(null);
	let testingId = $state<string | null>(null);

	// Modal Functions
	function openAddModal() {
		modalMode = 'add';
		editingServer = null;
		saveError = null;
		modalOpen = true;
	}

	function openEditModal(server: MediaBrowserServerPublic) {
		modalMode = 'edit';
		editingServer = server;
		saveError = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingServer = null;
		saveError = null;
	}

	async function handleTest(formData: MediaBrowserFormData): Promise<MediaBrowserTestResult> {
		try {
			// Use the test endpoint
			const url = editingServer
				? `/api/notifications/mediabrowser/${editingServer.id}/test`
				: '/api/notifications/mediabrowser/test';

			const body = editingServer
				? { apiKey: formData.apiKey || undefined }
				: {
						host: formData.host,
						apiKey: formData.apiKey,
						serverType: formData.serverType
					};

			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(formData: MediaBrowserFormData) {
		saving = true;
		saveError = null;
		try {
			const form = new FormData();
			form.append('data', JSON.stringify(formData));

			let response: Response;
			if (modalMode === 'edit' && editingServer) {
				form.append('id', editingServer.id);
				response = await fetch(`?/updateServer`, {
					method: 'POST',
					body: form
				});
			} else {
				response = await fetch(`?/createServer`, {
					method: 'POST',
					body: form
				});
			}

			const result = await response.json();
			if (result.type === 'failure' || result.data?.serverError) {
				const errorMessage = result.data?.serverError || 'Failed to save server';
				saveError = errorMessage;
				return;
			}

			await invalidateAll();
			closeModal();
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingServer) return;

		const form = new FormData();
		form.append('id', editingServer.id);
		await fetch(`?/deleteServer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		closeModal();
	}

	function confirmDelete(server: MediaBrowserServerPublic) {
		deleteTarget = server;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;

		const form = new FormData();
		form.append('id', deleteTarget.id);
		await fetch(`?/deleteServer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleToggle(server: MediaBrowserServerPublic) {
		const form = new FormData();
		form.append('id', server.id);
		form.append('enabled', (!server.enabled).toString());
		await fetch(`?/toggleServer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
	}

	async function handleTestFromTable(server: MediaBrowserServerPublic) {
		testingId = server.id;
		try {
			await fetch(`/api/notifications/mediabrowser/${server.id}/test`, {
				method: 'POST'
			});
			await invalidateAll();
		} finally {
			testingId = null;
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Media Servers</h1>
		<p class="text-base-content/70">
			Configure Jellyfin and Emby servers for library update notifications.
		</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Server
		</button>
	</div>

	{#if form?.serverError}
		<div class="mb-4 alert alert-error">
			<span>{form.serverError}</span>
		</div>
	{/if}

	{#if form?.serverSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-0">
			<MediaBrowserTable
				servers={data.servers}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onToggle={handleToggle}
				onTest={handleTestFromTable}
				{testingId}
			/>
		</div>
	</div>
</div>

<!-- Media Server Modal -->
<MediaBrowserModal
	open={modalOpen}
	mode={modalMode}
	server={editingServer}
	{saving}
	error={saveError}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleTest}
/>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	open={confirmDeleteOpen}
	title="Confirm Delete"
	message="Are you sure you want to delete {deleteTarget?.name}? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmDelete}
	onCancel={() => (confirmDeleteOpen = false)}
/>
