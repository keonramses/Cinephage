<script lang="ts">
	import { X, Loader2, AlertTriangle } from 'lucide-svelte';
	import ModalWrapper from './ModalWrapper.svelte';

	interface Props {
		open: boolean;
		title?: string;
		itemName: string;
		loading?: boolean;
		onConfirm: (deleteFiles: boolean) => void;
		onCancel: () => void;
	}

	let { open, title = 'Delete', itemName, loading = false, onConfirm, onCancel }: Props = $props();

	let deleteFiles = $state(false);

	function handleConfirm() {
		onConfirm(deleteFiles);
	}

	function handleClose() {
		deleteFiles = false;
		onCancel();
	}
</script>

<ModalWrapper {open} onClose={handleClose} maxWidth="md" labelledBy="delete-modal-title">
	<div class="mb-4 flex items-center justify-between">
		<h3 id="delete-modal-title" class="text-lg font-bold">{title}</h3>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			onclick={handleClose}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<p class="py-2">
		Delete files for <strong>"{itemName}"</strong>? The item will remain in your library but show as
		missing.
	</p>

	<label class="mt-4 flex cursor-pointer items-center gap-3 py-2">
		<input type="checkbox" class="checkbox shrink-0 checkbox-error" bind:checked={deleteFiles} />
		<span class="text-sm">Delete files from disk</span>
	</label>

	{#if deleteFiles}
		<div class="mt-3 alert alert-warning">
			<AlertTriangle class="h-4 w-4" />
			<span class="text-sm"
				>Files will be permanently deleted from disk. This cannot be undone.</span
			>
		</div>
	{:else}
		<div class="mt-3 alert alert-info">
			<span class="text-sm"
				>Files will remain on disk but become unmatched. You can re-match them later.</span
			>
		</div>
	{/if}

	<div class="modal-action">
		<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={loading}>
			Cancel
		</button>
		<button type="button" class="btn btn-error" onclick={handleConfirm} disabled={loading}>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Delete
		</button>
	</div>
</ModalWrapper>
