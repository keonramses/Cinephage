<script lang="ts">
	import { Loader2, Save, Trash2 } from 'lucide-svelte';

	interface Props {
		onCancel: () => void;
		onSave?: () => void;
		onDelete?: () => void;
		saving?: boolean;
		deleting?: boolean;
		saveDisabled?: boolean;
		saveLabel?: string;
		cancelLabel?: string;
		deleteLabel?: string;
		showDelete?: boolean;
		readonly?: boolean;
	}

	let {
		onCancel,
		onSave,
		onDelete,
		saving = false,
		deleting = false,
		saveDisabled = false,
		saveLabel = 'Save',
		cancelLabel = 'Cancel',
		deleteLabel = 'Delete',
		showDelete = false,
		readonly = false
	}: Props = $props();
</script>

<div class="modal-action mt-6 flex-wrap gap-2 border-t border-base-300 pt-4">
	{#if showDelete && onDelete}
		<button
			class="btn mr-auto text-error btn-ghost"
			onclick={onDelete}
			disabled={deleting || saving}
		>
			{#if deleting}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Trash2 class="h-4 w-4" />
			{/if}
			{deleteLabel}
		</button>
	{/if}

	<button class="btn btn-ghost" onclick={onCancel}>
		{readonly ? 'Close' : cancelLabel}
	</button>

	{#if !readonly && onSave}
		<button class="btn gap-2 btn-primary" onclick={onSave} disabled={saving || saveDisabled}>
			{#if saving}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Save class="h-4 w-4" />
			{/if}
			{saveLabel}
		</button>
	{/if}
</div>
