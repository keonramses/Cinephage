<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Optional header snippet rendered in a sticky header bar */
		header?: Snippet;
		/** Main content */
		children: Snippet;
		/** Additional classes for the main content area */
		class?: string;
		/** Whether to show the sticky header (default: true if header is provided) */
		showHeader?: boolean;
		/** Additional padding at the bottom for fixed elements like action bars */
		bottomPadding?: boolean;
	}

	let {
		header,
		children,
		class: className = '',
		showHeader = true,
		bottomPadding = false
	}: Props = $props();
</script>

<div class="min-h-screen bg-base-100" class:pb-20={bottomPadding}>
	{#if header && showHeader}
		<!-- Sticky Header -->
		<div class="sticky top-0 z-30 border-b border-base-200 bg-base-100/80 backdrop-blur-md">
			<div class="flex h-16 w-full items-center justify-between px-4 lg:px-8">
				{@render header()}
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	<main class="w-full px-4 py-8 lg:px-8 {className}">
		{@render children()}
	</main>
</div>
