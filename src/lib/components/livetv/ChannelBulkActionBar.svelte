<script lang="ts">
	import { X, FolderOpen, Trash2, Loader2 } from 'lucide-svelte';
	import type { ChannelCategory } from '$lib/types/livetv';

	interface Props {
		selectedCount: number;
		categories: ChannelCategory[];
		loading: boolean;
		currentAction: 'category' | 'remove' | null;
		onSetCategory: (categoryId: string | null) => void;
		onRemove: () => void;
		onClear: () => void;
	}

	let {
		selectedCount,
		categories,
		loading,
		currentAction,
		onSetCategory,
		onRemove,
		onClear
	}: Props = $props();

	let dropdownOpen = $state(false);

	function handleCategorySelect(categoryId: string | null) {
		dropdownOpen = false;
		onSetCategory(categoryId);
	}

	const channelLabel = $derived(selectedCount === 1 ? 'channel' : 'channels');
</script>

{#if selectedCount > 0}
	<div class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
		<div
			class="flex items-center gap-3 rounded-full border border-base-content/10 bg-base-300 px-4 py-2.5 shadow-xl"
		>
			<span class="text-sm font-medium">
				{selectedCount}
				{channelLabel} selected
			</span>

			<div class="h-4 w-px bg-base-content/20"></div>

			<div class="flex items-center gap-1">
				<!-- Set Category Dropdown -->
				<div class="dropdown dropdown-top">
					<button
						class="btn gap-1.5 btn-ghost btn-sm"
						onclick={() => (dropdownOpen = !dropdownOpen)}
						disabled={loading}
						tabindex="0"
					>
						{#if loading && currentAction === 'category'}
							<Loader2 size={16} class="animate-spin" />
						{:else}
							<FolderOpen size={16} />
						{/if}
						<span class="hidden sm:inline">Category</span>
					</button>

					{#if dropdownOpen}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<ul
							class="dropdown-content menu z-50 mb-2 w-52 rounded-box bg-base-200 p-2 shadow-lg"
							tabindex="0"
						>
							<li>
								<button onclick={() => handleCategorySelect(null)}>
									<span class="h-3 w-3 rounded-full bg-base-content/20"></span>
									Uncategorized
								</button>
							</li>
							{#if categories.length > 0}
								<li class="menu-title">
									<span>Categories</span>
								</li>
								{#each categories as cat (cat.id)}
									<li>
										<button onclick={() => handleCategorySelect(cat.id)}>
											{#if cat.color}
												<span class="h-3 w-3 rounded-full" style="background-color: {cat.color}"
												></span>
											{:else}
												<span class="h-3 w-3 rounded-full bg-base-content/20"></span>
											{/if}
											{cat.name}
										</button>
									</li>
								{/each}
							{/if}
						</ul>
					{/if}
				</div>

				<!-- Remove Button -->
				<button
					class="btn gap-1.5 text-error btn-ghost btn-sm hover:bg-error/10"
					onclick={onRemove}
					disabled={loading}
					title="Remove from lineup"
				>
					{#if loading && currentAction === 'remove'}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<Trash2 size={16} />
					{/if}
					<span class="hidden sm:inline">Remove</span>
				</button>
			</div>

			<div class="h-4 w-px bg-base-content/20"></div>

			<!-- Clear Selection -->
			<button
				class="btn btn-circle btn-ghost btn-sm"
				onclick={onClear}
				disabled={loading}
				title="Clear selection"
			>
				<X size={16} />
			</button>
		</div>
	</div>
{/if}

<!-- Click outside to close dropdown -->
{#if dropdownOpen}
	<div
		class="fixed inset-0 z-40"
		onclick={() => (dropdownOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (dropdownOpen = false)}
		role="button"
		tabindex="-1"
	></div>
{/if}
