<script lang="ts">
	import {
		Loader2,
		Tv,
		Plus,
		Trash2,
		ChevronUp,
		ChevronDown,
		AlertCircle,
		X,
		Copy,
		Check,
		Archive,
		Link
	} from 'lucide-svelte';
	import type {
		ChannelLineupItemWithDetails,
		ChannelCategory,
		UpdateChannelRequest,
		ChannelBackupLink
	} from '$lib/types/livetv';
	import { SectionHeader } from '$lib/components/ui/modal';

	interface Props {
		open: boolean;
		channel: ChannelLineupItemWithDetails | null;
		categories: ChannelCategory[];
		saving: boolean;
		error: string | null;
		onClose: () => void;
		onSave: (id: string, data: UpdateChannelRequest) => void;
		onDelete?: () => void;
		onOpenBackupBrowser?: (lineupItemId: string, excludeChannelId: string) => void;
		onOpenEpgSourcePicker?: (channelId: string) => void;
	}

	let {
		open,
		channel,
		categories,
		saving,
		error,
		onClose,
		onSave,
		onDelete,
		onOpenBackupBrowser,
		onOpenEpgSourcePicker
	}: Props = $props();

	// Form state
	let channelNumber = $state<number | null>(null);
	let customName = $state('');
	let customLogo = $state('');
	let categoryId = $state<string | null>(null);
	let epgId = $state('');
	let epgSourceChannelId = $state<string | null>(null);

	// Backup links state
	let backups = $state<ChannelBackupLink[]>([]);
	let loadingBackups = $state(false);
	let backupError = $state<string | null>(null);
	let backupSaving = $state(false);

	// Copy state for stream command
	let copiedCmd = $state(false);

	// Validation
	const channelNumberError = $derived(
		channelNumber !== null && channelNumber < 1 ? 'Must be 1 or greater' : null
	);

	const customLogoError = $derived(
		customLogo.trim() && !customLogo.trim().match(/^https?:\/\//) ? 'Must be a valid URL' : null
	);

	const isValid = $derived(!channelNumberError && !customLogoError);

	// Computed logo preview URL
	const logoPreviewUrl = $derived.by(() => {
		const trimmed = customLogo.trim();
		if (trimmed && !customLogoError) {
			return trimmed;
		}
		return channel?.channel.logo || null;
	});

	// Load backups when modal opens
	async function loadBackups() {
		if (!channel) return;
		loadingBackups = true;
		backupError = null;
		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups`);
			if (res.ok) {
				const data = await res.json();
				backups = data.backups || [];
			} else {
				backupError = 'Failed to load backups';
			}
		} catch {
			backupError = 'Failed to load backups';
		} finally {
			loadingBackups = false;
		}
	}

	// Remove a backup with proper error handling
	async function removeBackup(backupId: string) {
		if (!channel) return;
		const previousBackups = [...backups];
		backups = backups.filter((b) => b.id !== backupId);
		backupError = null;

		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups/${backupId}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				backups = previousBackups;
				backupError = 'Failed to remove backup';
			}
		} catch {
			backups = previousBackups;
			backupError = 'Failed to remove backup';
		}
	}

	// Move backup up in priority
	async function moveBackupUp(index: number) {
		if (index === 0 || !channel) return;
		const newOrder = [...backups];
		[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
		backups = newOrder;
		await saveBackupOrder();
	}

	// Move backup down in priority
	async function moveBackupDown(index: number) {
		if (index >= backups.length - 1 || !channel) return;
		const newOrder = [...backups];
		[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
		backups = newOrder;
		await saveBackupOrder();
	}

	// Save backup order with proper error handling
	async function saveBackupOrder() {
		if (!channel) return;
		const previousOrder = [...backups];
		backupSaving = true;
		backupError = null;

		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups/reorder`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ backupIds: backups.map((b) => b.id) })
			});
			if (!res.ok) {
				backups = previousOrder;
				backupError = 'Failed to reorder backups';
			}
		} catch {
			backups = previousOrder;
			backupError = 'Failed to reorder backups';
		} finally {
			backupSaving = false;
		}
	}

	// Copy stream command to clipboard
	async function copyStreamCommand() {
		if (!channel?.channel.cmd) return;
		try {
			await navigator.clipboard.writeText(channel.channel.cmd);
			copiedCmd = true;
			setTimeout(() => {
				copiedCmd = false;
			}, 2000);
		} catch {
			// Silent failure
		}
	}

	// Initialize form when channel changes
	$effect(() => {
		if (channel && open) {
			channelNumber = channel.channelNumber;
			customName = channel.customName || '';
			customLogo = channel.customLogo || '';
			categoryId = channel.categoryId;
			epgId = channel.epgId || '';
			epgSourceChannelId = channel.epgSourceChannelId;
			backupError = null;
			copiedCmd = false;
			loadBackups();
		}
	});

	// Expose refresh function for parent to call after adding a backup
	export function refreshBackups() {
		loadBackups();
	}

	// Expose function for parent to set EPG source after picker selection
	export function setEpgSourceChannelId(channelId: string | null) {
		epgSourceChannelId = channelId;
	}

	function handleSubmit() {
		if (!channel || saving || !isValid) return;

		const data: UpdateChannelRequest = {
			channelNumber: channelNumber || null,
			customName: customName.trim() || null,
			customLogo: customLogo.trim() || null,
			categoryId,
			epgId: epgId.trim() || null,
			epgSourceChannelId
		};

		onSave(channel.id, data);
	}

	function clearEpgSource() {
		epgSourceChannelId = null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function formatArchiveDuration(hours: number): string {
		if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
		const days = Math.floor(hours / 24);
		return `${days} day${days !== 1 ? 's' : ''}`;
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open && channel}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-3xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">Edit Channel</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Channel Info Banner -->
			<div class="mb-6 flex items-center gap-4 rounded-lg bg-base-200 px-4 py-3">
				{#if channel.displayLogo}
					<img
						src={channel.displayLogo}
						alt=""
						class="h-14 w-14 rounded-lg bg-base-300 object-contain"
					/>
				{:else}
					<div class="flex h-14 w-14 items-center justify-center rounded-lg bg-base-300">
						<Tv class="h-7 w-7 text-base-content/30" />
					</div>
				{/if}
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<span class="font-semibold">{channel.channel.name}</span>
						{#if channel.channel.tvArchive}
							<span class="badge gap-1 badge-sm badge-info">
								<Archive class="h-3 w-3" />
								Archive
							</span>
						{/if}
					</div>
					<div class="text-sm text-base-content/60">{channel.accountName}</div>
				</div>
			</div>

			<!-- Error -->
			{#if error}
				<div class="mb-6 alert alert-error">
					<AlertCircle class="h-5 w-5" />
					<div>
						<div class="font-medium">Failed to save</div>
						<div class="text-sm opacity-80">{error}</div>
					</div>
				</div>
			{/if}

			<!-- Display Settings Section -->
			<div class="space-y-4">
				<SectionHeader title="Display Settings" />

				<div class="grid grid-cols-2 gap-6">
					<!-- Channel Number -->
					<div class="form-control">
						<label class="label" for="channelNumber">
							<span class="label-text font-medium">Channel Number</span>
						</label>
						<input
							type="number"
							id="channelNumber"
							class="input-bordered input {channelNumberError ? 'input-error' : ''}"
							bind:value={channelNumber}
							placeholder={String(channel.position)}
							min="1"
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/60">
								{#if channelNumberError}
									<span class="text-error">{channelNumberError}</span>
								{:else}
									Display number in your lineup
								{/if}
							</span>
						</div>
					</div>

					<!-- Category -->
					<div class="form-control">
						<label class="label" for="category">
							<span class="label-text font-medium">Category</span>
						</label>
						<select id="category" class="select-bordered select" bind:value={categoryId}>
							<option value={null}>Uncategorized</option>
							{#each categories as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
						<div class="label">
							<span class="label-text-alt text-base-content/60">Group channels together</span>
						</div>
					</div>

					<!-- Custom Name -->
					<div class="form-control">
						<label class="label" for="customName">
							<span class="label-text font-medium">Custom Name</span>
						</label>
						<input
							type="text"
							id="customName"
							class="input-bordered input"
							bind:value={customName}
							placeholder={channel.channel.name}
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/60">Override the channel name</span>
						</div>
					</div>

					<!-- EPG ID -->
					<div class="form-control">
						<label class="label" for="epgId">
							<span class="label-text font-medium">EPG ID</span>
						</label>
						<input
							type="text"
							id="epgId"
							class="input-bordered input"
							bind:value={epgId}
							placeholder="XMLTV channel ID"
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/60">Match with EPG guide data</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Logo Section -->
			<div class="mt-6 space-y-4">
				<SectionHeader title="Logo" />

				<div class="grid grid-cols-2 gap-6">
					<div class="form-control">
						<label class="label" for="customLogo">
							<span class="label-text font-medium">Custom Logo URL</span>
						</label>
						<input
							type="url"
							id="customLogo"
							class="input-bordered input {customLogoError ? 'input-error' : ''}"
							bind:value={customLogo}
							placeholder="https://..."
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/60">
								{#if customLogoError}
									<span class="text-error">{customLogoError}</span>
								{:else}
									Leave blank to use original logo
								{/if}
							</span>
						</div>
					</div>

					<!-- Logo Preview -->
					<div class="form-control">
						<label class="label">
							<span class="label-text font-medium">Preview</span>
						</label>
						<div class="flex h-[48px] items-center gap-3 rounded-lg bg-base-200 px-3">
							{#if logoPreviewUrl}
								<img
									src={logoPreviewUrl}
									alt="Logo preview"
									class="h-10 w-10 rounded bg-base-300 object-contain"
								/>
								<span class="flex-1 truncate text-sm text-base-content/60">
									{customLogo.trim() ? 'Custom logo' : 'Original logo'}
								</span>
							{:else}
								<div class="flex h-10 w-10 items-center justify-center rounded bg-base-300">
									<Tv class="h-5 w-5 text-base-content/30" />
								</div>
								<span class="text-sm text-base-content/60">No logo available</span>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- EPG Source Override Section -->
			<div class="mt-6 space-y-4">
				<SectionHeader title="EPG Source" />

				<div class="form-control">
					<label class="label">
						<span class="label-text font-medium">Override EPG Source</span>
					</label>

					{#if epgSourceChannelId && channel.epgSourceChannel}
						<div class="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2">
							{#if channel.epgSourceChannel.logo}
								<img
									src={channel.epgSourceChannel.logo}
									alt=""
									class="h-10 w-10 rounded bg-base-300 object-contain"
								/>
							{:else}
								<div class="flex h-10 w-10 items-center justify-center rounded bg-base-300">
									<Tv class="h-5 w-5 text-base-content/30" />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{channel.epgSourceChannel.name}</div>
								<div class="text-xs text-base-content/50">{channel.epgSourceAccountName}</div>
							</div>
							<button
								type="button"
								class="btn text-error btn-ghost btn-sm"
								onclick={clearEpgSource}
								title="Remove EPG source override"
							>
								<X class="h-4 w-4" />
							</button>
						</div>
					{:else if epgSourceChannelId}
						<!-- EPG source set but channel details not loaded yet -->
						<div class="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2">
							<div class="flex h-10 w-10 items-center justify-center rounded bg-base-300">
								<Link class="h-5 w-5 text-base-content/30" />
							</div>
							<div class="flex-1">
								<div class="text-sm text-base-content/60">EPG source selected</div>
							</div>
							<button
								type="button"
								class="btn text-error btn-ghost btn-sm"
								onclick={clearEpgSource}
								title="Remove EPG source override"
							>
								<X class="h-4 w-4" />
							</button>
						</div>
					{:else}
						<button
							type="button"
							class="btn gap-2 btn-outline btn-sm"
							onclick={() => onOpenEpgSourcePicker?.(channel.channelId)}
						>
							<Link class="h-4 w-4" />
							Select EPG Source
						</button>
					{/if}

					<div class="label">
						<span class="label-text-alt text-base-content/60">
							Use EPG data from a different channel (e.g., same channel on another account)
						</span>
					</div>
				</div>
			</div>

			<!-- Technical Details Section -->
			<div class="mt-6 space-y-4">
				<SectionHeader title="Technical Details" />

				<div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
					<div>
						<span class="text-base-content/50">Original Name</span>
						<p class="font-medium">{channel.channel.name}</p>
					</div>
					<div>
						<span class="text-base-content/50">Original Number</span>
						<p class="font-medium">{channel.channel.number || 'None'}</p>
					</div>
					<div>
						<span class="text-base-content/50">Provider Category</span>
						<p class="font-medium">{channel.channel.categoryTitle || 'None'}</p>
					</div>
					<div>
						<span class="text-base-content/50">Archive</span>
						<p class="font-medium">
							{#if channel.channel.tvArchive}
								Yes ({formatArchiveDuration(channel.channel.archiveDuration)})
							{:else}
								No
							{/if}
						</p>
					</div>
					<div class="col-span-2">
						<span class="text-base-content/50">Stream Command</span>
						<div class="mt-1 flex items-center gap-2">
							<code
								class="flex-1 truncate rounded bg-base-200 px-2 py-1 font-mono text-xs"
								title={channel.channel.cmd}
							>
								{channel.channel.cmd}
							</code>
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								onclick={copyStreamCommand}
								title="Copy to clipboard"
							>
								{#if copiedCmd}
									<Check class="h-3.5 w-3.5 text-success" />
								{:else}
									<Copy class="h-3.5 w-3.5" />
								{/if}
							</button>
						</div>
					</div>
					<div>
						<span class="text-base-content/50">Account ID</span>
						<p class="font-mono text-xs">{channel.accountId}</p>
					</div>
					<div>
						<span class="text-base-content/50">Channel ID</span>
						<p class="font-mono text-xs">{channel.channelId}</p>
					</div>
				</div>
			</div>

			<!-- Backup Sources Section -->
			<div class="mt-6 space-y-4">
				<div class="flex items-center justify-between">
					<SectionHeader title="Backup Sources" class="border-b-0 pb-0" />
					{#if onOpenBackupBrowser}
						<button
							type="button"
							class="btn gap-1 btn-ghost btn-sm"
							onclick={() => onOpenBackupBrowser(channel.id, channel.channelId)}
						>
							<Plus class="h-4 w-4" />
							Add Backup
						</button>
					{/if}
				</div>

				{#if backupError}
					<div class="alert py-2 alert-error">
						<AlertCircle class="h-4 w-4" />
						<span class="text-sm">{backupError}</span>
					</div>
				{/if}

				{#if loadingBackups}
					<div class="flex justify-center py-4">
						<Loader2 class="h-5 w-5 animate-spin text-base-content/50" />
					</div>
				{:else if backups.length === 0}
					<p class="py-2 text-sm text-base-content/50">
						No backup sources configured. Backups provide failover if the primary stream is
						unavailable.
					</p>
				{:else}
					<div class="space-y-2">
						{#each backups as backup, i (backup.id)}
							<div class="flex items-center gap-3 rounded-lg bg-base-200 px-3 py-2">
								<span class="badge badge-sm badge-neutral">{i + 1}</span>
								{#if backup.channel.logo}
									<img
										src={backup.channel.logo}
										alt=""
										class="h-8 w-8 rounded bg-base-300 object-contain"
									/>
								{:else}
									<div class="flex h-8 w-8 items-center justify-center rounded bg-base-300">
										<Tv class="h-4 w-4 text-base-content/30" />
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{backup.channel.name}</span>
									<span class="text-xs text-base-content/50">{backup.accountName}</span>
								</div>
								<div class="flex gap-1">
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => moveBackupUp(i)}
										disabled={i === 0 || backupSaving}
										title="Move up"
									>
										<ChevronUp class="h-4 w-4" />
									</button>
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => moveBackupDown(i)}
										disabled={i >= backups.length - 1 || backupSaving}
										title="Move down"
									>
										<ChevronDown class="h-4 w-4" />
									</button>
									<button
										type="button"
										class="btn text-error btn-ghost btn-xs"
										onclick={() => removeBackup(backup.id)}
										title="Remove backup"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-action mt-6">
				{#if onDelete}
					<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
				{/if}

				<button class="btn btn-ghost" onclick={onClose} disabled={saving}>Cancel</button>
				<button class="btn btn-primary" onclick={handleSubmit} disabled={saving || !isValid}>
					{#if saving}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Save
				</button>
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
