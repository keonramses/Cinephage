<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
		children: Snippet;
	}

	let { open, onClose, maxWidth = 'lg', children }: Props = $props();

	const maxWidthClasses = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl',
		'2xl': 'max-w-2xl',
		'3xl': 'max-w-3xl'
	};

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] overflow-y-auto {maxWidthClasses[maxWidth]}">
			{@render children()}
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
