<script lang="ts">
	import { Plus, RefreshCw, Loader2 } from 'lucide-svelte';
	import { StalkerAccountTable, StalkerAccountModal } from '$lib/components/livetv';
	import type { StalkerAccount, StalkerAccountTestResult } from '$lib/types/livetv';
	import { onMount } from 'svelte';

	// State
	let accounts = $state<StalkerAccount[]>([]);
	let loading = $state(true);
	let refreshing = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingAccount = $state<StalkerAccount | null>(null);
	let modalError = $state<string | null>(null);

	// Testing state
	let testingId = $state<string | null>(null);

	// Syncing state
	let syncingId = $state<string | null>(null);

	// Load accounts on mount
	onMount(() => {
		loadAccounts();
	});

	async function loadAccounts() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/livetv/accounts');
			if (!response.ok) {
				throw new Error('Failed to load accounts');
			}
			accounts = await response.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load accounts';
		} finally {
			loading = false;
		}
	}

	async function refreshAccounts() {
		refreshing = true;
		await loadAccounts();
		refreshing = false;
	}

	function openAddModal() {
		modalMode = 'add';
		editingAccount = null;
		modalError = null;
		modalOpen = true;
	}

	function openEditModal(account: StalkerAccount) {
		modalMode = 'edit';
		editingAccount = account;
		modalError = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingAccount = null;
		modalError = null;
	}

	async function handleSave(data: {
		name: string;
		portalUrl: string;
		macAddress: string;
		enabled: boolean;
	}) {
		saving = true;
		modalError = null;

		try {
			const url =
				modalMode === 'add' ? '/api/livetv/accounts' : `/api/livetv/accounts/${editingAccount!.id}`;

			const method = modalMode === 'add' ? 'POST' : 'PUT';

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save account');
			}

			await loadAccounts();
			closeModal();
		} catch (e) {
			modalError = e instanceof Error ? e.message : 'Failed to save account';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingAccount) return;

		const confirmed = confirm(`Are you sure you want to delete "${editingAccount.name}"?`);
		if (!confirmed) return;

		saving = true;
		modalError = null;

		try {
			const response = await fetch(`/api/livetv/accounts/${editingAccount.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete account');
			}

			await loadAccounts();
			closeModal();
		} catch (e) {
			modalError = e instanceof Error ? e.message : 'Failed to delete account';
		} finally {
			saving = false;
		}
	}

	async function handleToggle(account: StalkerAccount) {
		try {
			const response = await fetch(`/api/livetv/accounts/${account.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: !account.enabled })
			});

			if (!response.ok) {
				throw new Error('Failed to update account');
			}

			await loadAccounts();
		} catch (e) {
			console.error('Failed to toggle account:', e);
		}
	}

	async function handleTest(account: StalkerAccount) {
		testingId = account.id;

		try {
			const response = await fetch(`/api/livetv/accounts/${account.id}/test`, {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to test account');
			}

			// Reload to get updated test results
			await loadAccounts();
		} catch (e) {
			console.error('Failed to test account:', e);
		} finally {
			testingId = null;
		}
	}

	async function handleSync(account: StalkerAccount) {
		syncingId = account.id;

		try {
			const response = await fetch('/api/livetv/channels/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountIds: [account.id] })
			});

			if (!response.ok) {
				throw new Error('Failed to sync account');
			}

			// Reload to get updated sync results
			await loadAccounts();
		} catch (e) {
			console.error('Failed to sync account:', e);
		} finally {
			syncingId = null;
		}
	}

	async function handleTestConfig(config: {
		portalUrl: string;
		macAddress: string;
	}): Promise<StalkerAccountTestResult> {
		const response = await fetch('/api/livetv/accounts/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(config)
		});

		return response.json();
	}
</script>

<svelte:head>
	<title>Stalker Accounts - Live TV - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Stalker Accounts</h1>
			<p class="mt-1 text-base-content/60">Manage your Stalker Portal IPTV accounts</p>
		</div>
		<div class="flex gap-2">
			<button
				class="btn btn-ghost btn-sm"
				onclick={refreshAccounts}
				disabled={loading || refreshing}
				title="Refresh"
			>
				{#if refreshing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
				{/if}
			</button>
			<button class="btn btn-sm btn-primary" onclick={openAddModal}>
				<Plus class="h-4 w-4" />
				Add Account
			</button>
		</div>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if error}
		<div class="alert alert-error">
			<span>{error}</span>
			<button class="btn btn-ghost btn-sm" onclick={loadAccounts}>Retry</button>
		</div>
	{:else}
		<StalkerAccountTable
			{accounts}
			onEdit={openEditModal}
			onDelete={(account) => {
				editingAccount = account;
				handleDelete();
			}}
			onToggle={handleToggle}
			onTest={handleTest}
			onSync={handleSync}
			{testingId}
			{syncingId}
		/>
	{/if}
</div>

<!-- Modal -->
<StalkerAccountModal
	open={modalOpen}
	mode={modalMode}
	account={editingAccount}
	{saving}
	error={modalError}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleTestConfig}
/>
