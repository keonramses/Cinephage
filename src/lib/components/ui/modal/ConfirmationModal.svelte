<script lang="ts">
	import { X, Loader2 } from 'lucide-svelte';
	import ModalWrapper from './ModalWrapper.svelte';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmVariant?: 'error' | 'warning' | 'primary';
		loading?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		title = 'Confirm',
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmVariant = 'primary',
		loading = false,
		onConfirm,
		onCancel
	}: Props = $props();

	const buttonClass = $derived(
		confirmVariant === 'error'
			? 'btn-error'
			: confirmVariant === 'warning'
				? 'btn-warning'
				: 'btn-primary'
	);
</script>

<ModalWrapper {open} onClose={onCancel} maxWidth="md" labelledBy="confirm-modal-title">
	<div class="mb-4 flex items-center justify-between">
		<h3 id="confirm-modal-title" class="text-lg font-bold">{title}</h3>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			onclick={onCancel}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<p class="py-2">{message}</p>

	<div class="modal-action">
		<button type="button" class="btn btn-ghost" onclick={onCancel} disabled={loading}>
			{cancelLabel}
		</button>
		<button type="button" class="btn {buttonClass}" onclick={onConfirm} disabled={loading}>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			{confirmLabel}
		</button>
	</div>
</ModalWrapper>
