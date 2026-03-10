<script lang="ts">
	import { X, Loader2, Pencil } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import type { ChannelCleanNamePreview } from '$lib/types/livetv';

	interface Props {
		open: boolean;
		loading: boolean;
		selectedCount: number;
		previews: ChannelCleanNamePreview[];
		skippedExistingCustom: number;
		skippedUnchanged: number;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		loading,
		selectedCount,
		previews,
		skippedExistingCustom,
		skippedUnchanged,
		onConfirm,
		onCancel
	}: Props = $props();

	const applicableCount = $derived(previews.length);
	const selectedLabel = $derived(selectedCount === 1 ? 'channel' : 'channels');

	function handleClose() {
		if (loading) return;
		onCancel();
	}
</script>

<ModalWrapper
	{open}
	onClose={handleClose}
	maxWidth="3xl"
	labelledBy="channel-bulk-clean-names-modal-title"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<div>
			<h3 id="channel-bulk-clean-names-modal-title" class="text-lg font-bold">
				Apply Cleaned Names
			</h3>
			<p class="mt-1 text-sm text-base-content/60">
				Review the provider names that will be saved as custom names.
			</p>
		</div>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			onclick={handleClose}
			aria-label="Close"
			disabled={loading}
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<div class="mb-4 grid gap-2 sm:grid-cols-3">
		<div class="rounded-box border border-base-content/10 bg-base-200/50 p-3">
			<div class="text-xs tracking-wide text-base-content/50 uppercase">Selected</div>
			<div class="mt-1 text-lg font-semibold">{selectedCount}</div>
			<div class="text-sm text-base-content/60">{selectedLabel}</div>
		</div>
		<div class="rounded-box border border-success/20 bg-success/10 p-3">
			<div class="text-xs tracking-wide text-success/70 uppercase">Will Apply</div>
			<div class="mt-1 text-lg font-semibold text-success">{applicableCount}</div>
			<div class="text-sm text-base-content/60">cleaned custom names</div>
		</div>
		<div class="rounded-box border border-base-content/10 bg-base-200/50 p-3">
			<div class="text-xs tracking-wide text-base-content/50 uppercase">Skipped</div>
			<div class="mt-1 text-lg font-semibold">{skippedExistingCustom + skippedUnchanged}</div>
			<div class="text-sm text-base-content/60">
				{skippedExistingCustom} custom, {skippedUnchanged} unchanged
			</div>
		</div>
	</div>

	{#if applicableCount > 0}
		<div class="overflow-hidden rounded-box border border-base-content/10 bg-base-100">
			<div class="max-h-[55vh] overflow-y-auto">
				<table class="table table-zebra table-sm">
					<thead>
						<tr>
							<th class="w-16">#</th>
							<th class="w-40">Source</th>
							<th>Provider Name</th>
							<th>Cleaned Name</th>
						</tr>
					</thead>
					<tbody>
						{#each previews as preview (preview.itemId)}
							<tr>
								<td class="font-mono text-xs text-base-content/60">
									{preview.channelNumber}
								</td>
								<td>
									<div class="flex flex-col gap-1">
										<span class="badge w-fit badge-ghost badge-sm">{preview.accountName}</span>
										<span class="text-xs text-base-content/50 uppercase">
											{preview.providerType}
										</span>
									</div>
								</td>
								<td class="max-w-sm">
									<div class="text-sm break-words text-base-content/70">{preview.currentName}</div>
								</td>
								<td class="max-w-sm">
									<div class="flex items-start gap-2 text-sm font-medium break-words">
										<Pencil class="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
										<span>{preview.cleanedName}</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else}
		<div class="alert alert-info">
			<span>
				Nothing to apply. Selected channels already have custom names or do not need cleanup.
			</span>
		</div>
	{/if}

	<div class="modal-action">
		<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={loading}>
			Cancel
		</button>
		<button
			type="button"
			class="btn btn-primary"
			onclick={onConfirm}
			disabled={loading || applicableCount === 0}
		>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Apply
			{applicableCount}
			Name{applicableCount === 1 ? '' : 's'}
		</button>
	</div>
</ModalWrapper>
