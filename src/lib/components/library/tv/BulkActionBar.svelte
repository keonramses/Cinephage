<script lang="ts">
	import { X, Download, Loader2 } from 'lucide-svelte';

	interface Props {
		selectedCount: number;
		searching: boolean;
		onSearch: () => void;
		onClear: () => void;
	}

	let { selectedCount, searching, onSearch, onClear }: Props = $props();
</script>

{#if selectedCount > 0}
	<div
		class="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 mx-auto max-w-fit"
	>
		<div
			class="flex items-center gap-3 rounded-full border border-base-content/10 bg-base-300 px-4 py-2.5 shadow-xl sm:gap-4 sm:px-6 sm:py-3"
		>
			<span class="text-sm font-medium">
				{selectedCount} episode{selectedCount !== 1 ? 's' : ''} selected
			</span>

			<div class="flex items-center gap-2">
				<button class="btn gap-2 btn-sm btn-primary" onclick={onSearch} disabled={searching}>
					{#if searching}
						<Loader2 size={16} class="animate-spin" />
						Searching...
					{:else}
						<Download size={16} />
						Search Selected
					{/if}
				</button>

				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClear} title="Clear selection">
					<X size={16} />
				</button>
			</div>
		</div>
	</div>
{/if}
