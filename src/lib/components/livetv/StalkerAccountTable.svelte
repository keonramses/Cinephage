<script lang="ts">
	import {
		Settings,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Tv,
		FlaskConical,
		Loader2,
		Calendar,
		RefreshCw
	} from 'lucide-svelte';
	import type { StalkerAccount } from '$lib/types/livetv';

	interface Props {
		accounts: StalkerAccount[];
		onEdit: (account: StalkerAccount) => void;
		onDelete: (account: StalkerAccount) => void;
		onToggle: (account: StalkerAccount) => void;
		onTest: (account: StalkerAccount) => Promise<void>;
		onSync: (account: StalkerAccount) => Promise<void>;
		testingId?: string | null;
		syncingId?: string | null;
	}

	let {
		accounts,
		onEdit,
		onDelete,
		onToggle,
		onTest,
		onSync,
		testingId = null,
		syncingId = null
	}: Props = $props();

	function formatDate(isoDate: string | null): string {
		if (!isoDate) return '-';
		try {
			return new Date(isoDate).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '-';
		}
	}

	function maskMac(mac: string): string {
		const parts = mac.split(':');
		if (parts.length !== 6) return mac;
		return `${parts[0]}:${parts[1]}:${parts[2]}:**:**:**`;
	}

	function getStatusBadge(account: StalkerAccount): { class: string; text: string } {
		if (account.lastTestSuccess === false) {
			return { class: 'badge-error', text: 'Error' };
		}

		if (account.expiresAt) {
			const expiry = new Date(account.expiresAt);
			const now = new Date();
			const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

			if (daysUntilExpiry < 0) {
				return { class: 'badge-error', text: 'Expired' };
			}
			if (daysUntilExpiry < 7) {
				return { class: 'badge-warning', text: `${daysUntilExpiry}d left` };
			}
			if (daysUntilExpiry < 30) {
				return { class: 'badge-info', text: `${daysUntilExpiry}d left` };
			}
		}

		return { class: 'badge-success', text: 'Active' };
	}

	function getSyncStatusBadge(account: StalkerAccount): { class: string; text: string } {
		const status = account.syncStatus ?? 'never';

		switch (status) {
			case 'syncing':
				return { class: 'badge-info', text: 'Syncing...' };
			case 'success':
				return { class: 'badge-success', text: 'Synced' };
			case 'failed':
				return { class: 'badge-error', text: 'Failed' };
			case 'never':
			default:
				return { class: 'badge-warning', text: 'Not synced' };
		}
	}

	function formatDateTime(isoDate: string | null): string {
		if (!isoDate) return '';
		try {
			return new Date(isoDate).toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}
</script>

{#if accounts.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Tv class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No Stalker accounts configured</p>
		<p class="mt-1 text-sm">Add an account to start using Live TV</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		<table class="table">
			<thead>
				<tr>
					<th>Account</th>
					<th>Portal</th>
					<th>Channels</th>
					<th>Sync</th>
					<th>Expires</th>
					<th>Status</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each accounts as account (account.id)}
					{@const status = getStatusBadge(account)}
					{@const syncStatus = getSyncStatusBadge(account)}
					<tr class="hover">
						<td>
							<div class="flex items-center gap-3">
								<div class="placeholder avatar">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-content"
									>
										<Tv class="h-5 w-5" />
									</div>
								</div>
								<div>
									<div class="font-bold">{account.name}</div>
									<div class="font-mono text-xs opacity-50">
										{maskMac(account.macAddress)}
									</div>
								</div>
							</div>
						</td>
						<td>
							<div class="max-w-xs truncate font-mono text-sm" title={account.portalUrl}>
								{account.portalUrl}
							</div>
						</td>
						<td>
							{#if account.channelCount !== null}
								<div class="flex flex-col gap-1">
									<span class="badge badge-ghost badge-sm">
										{account.channelCount.toLocaleString()} channels
									</span>
									{#if account.categoryCount !== null}
										<span class="badge badge-outline badge-sm">
											{account.categoryCount} categories
										</span>
									{/if}
								</div>
							{:else}
								<span class="badge badge-ghost badge-sm">-</span>
							{/if}
						</td>
						<td>
							<div class="flex flex-col gap-1">
								{#if syncingId === account.id}
									<span class="badge gap-1 badge-sm badge-info">
										<Loader2 class="h-3 w-3 animate-spin" />
										Syncing...
									</span>
								{:else}
									<span class="badge {syncStatus.class} badge-sm">{syncStatus.text}</span>
								{/if}
								{#if account.lastSyncAt}
									<span class="text-xs opacity-50">{formatDateTime(account.lastSyncAt)}</span>
								{/if}
								{#if account.lastSyncError}
									<span class="text-xs text-error" title={account.lastSyncError}>Error</span>
								{/if}
							</div>
						</td>
						<td>
							{#if account.expiresAt}
								<div class="flex items-center gap-1">
									<Calendar class="h-3 w-3 opacity-50" />
									<span class="text-sm">{formatDate(account.expiresAt)}</span>
								</div>
							{:else}
								<span class="text-sm opacity-50">-</span>
							{/if}
						</td>
						<td>
							<div class="flex flex-col gap-1">
								<span class="badge {status.class} badge-sm">{status.text}</span>
								<span class="badge {account.enabled ? 'badge-success' : 'badge-ghost'} badge-sm">
									{account.enabled ? 'Enabled' : 'Disabled'}
								</span>
							</div>
						</td>
						<td>
							<div class="flex justify-end gap-1">
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onSync(account)}
									title="Sync channels"
									disabled={syncingId === account.id || testingId === account.id}
								>
									{#if syncingId === account.id}
										<Loader2 class="h-4 w-4 animate-spin" />
									{:else}
										<RefreshCw class="h-4 w-4" />
									{/if}
								</button>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onTest(account)}
									title="Test connection"
									disabled={testingId === account.id || syncingId === account.id}
								>
									{#if testingId === account.id}
										<Loader2 class="h-4 w-4 animate-spin" />
									{:else}
										<FlaskConical class="h-4 w-4" />
									{/if}
								</button>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onToggle(account)}
									title={account.enabled ? 'Disable' : 'Enable'}
								>
									{#if account.enabled}
										<ToggleRight class="h-4 w-4 text-success" />
									{:else}
										<ToggleLeft class="h-4 w-4" />
									{/if}
								</button>
								<button class="btn btn-ghost btn-sm" onclick={() => onEdit(account)} title="Edit">
									<Settings class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-sm"
									onclick={() => onDelete(account)}
									title="Delete"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
