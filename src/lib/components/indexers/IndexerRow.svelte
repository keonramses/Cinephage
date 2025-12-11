<script lang="ts">
	import { Loader2, Play, Pencil, Trash2, Search, MousePointer } from 'lucide-svelte';
	import IndexerStatusBadge from './IndexerStatusBadge.svelte';
	import type { IndexerWithStatus } from '$lib/types/indexer';

	interface Props {
		indexer: IndexerWithStatus;
		selected: boolean;
		testing: boolean;
		onSelect: (id: string, selected: boolean) => void;
		onEdit: (indexer: IndexerWithStatus) => void;
		onDelete: (indexer: IndexerWithStatus) => void;
		onTest: (indexer: IndexerWithStatus) => void;
	}

	let { indexer, selected, testing, onSelect, onEdit, onDelete, onTest }: Props = $props();

	function truncateUrl(url: string, maxLength: number = 30): string {
		if (url.length <= maxLength) return url;
		return url.substring(0, maxLength) + '...';
	}
</script>

<tr class="hover">
	<!-- Checkbox -->
	<td class="w-10">
		<input
			type="checkbox"
			class="checkbox checkbox-sm"
			checked={selected}
			onchange={(e) => onSelect(indexer.id, e.currentTarget.checked)}
		/>
	</td>

	<!-- Status -->
	<td class="w-24">
		<IndexerStatusBadge
			enabled={indexer.enabled}
			healthy={indexer.status?.healthy ?? true}
			consecutiveFailures={indexer.status?.consecutiveFailures ?? 0}
			lastFailure={indexer.status?.lastFailure}
			disabledUntil={indexer.status?.disabledUntil}
		/>
	</td>

	<!-- Name -->
	<td>
		<button class="link font-medium link-hover" onclick={() => onEdit(indexer)}>
			{indexer.name}
		</button>
	</td>

	<!-- Definition -->
	<td class="text-base-content/70">
		{indexer.definitionName ?? indexer.definitionId}
	</td>

	<!-- Protocol -->
	<td>
		<div class="badge badge-outline badge-sm capitalize">
			{indexer.protocol}
		</div>
	</td>

	<!-- Search Capabilities -->
	<td>
		<div class="flex gap-1">
			<div
				class="tooltip"
				data-tip="Auto Search {indexer.enableAutomaticSearch ? 'enabled' : 'disabled'}"
			>
				<Search
					class="h-3.5 w-3.5 {indexer.enableAutomaticSearch
						? 'text-success'
						: 'text-base-content/30'}"
				/>
			</div>
			<div
				class="tooltip"
				data-tip="Interactive Search {indexer.enableInteractiveSearch ? 'enabled' : 'disabled'}"
			>
				<MousePointer
					class="h-3.5 w-3.5 {indexer.enableInteractiveSearch
						? 'text-success'
						: 'text-base-content/30'}"
				/>
			</div>
		</div>
	</td>

	<!-- Priority -->
	<td class="text-center">
		{indexer.priority}
	</td>

	<!-- URL -->
	<td class="max-w-[200px]">
		<div class="tooltip" data-tip={indexer.baseUrl}>
			<span class="block truncate text-sm text-base-content/70">
				{truncateUrl(indexer.baseUrl)}
			</span>
		</div>
	</td>

	<!-- Actions -->
	<td>
		<div class="flex gap-1">
			<button
				class="btn btn-ghost btn-xs"
				onclick={() => onTest(indexer)}
				disabled={testing}
				title="Test connection"
			>
				{#if testing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Play class="h-4 w-4" />
				{/if}
			</button>
			<button class="btn btn-ghost btn-xs" onclick={() => onEdit(indexer)} title="Edit indexer">
				<Pencil class="h-4 w-4" />
			</button>
			<button
				class="btn text-error btn-ghost btn-xs"
				onclick={() => onDelete(indexer)}
				title="Delete indexer"
			>
				<Trash2 class="h-4 w-4" />
			</button>
		</div>
	</td>
</tr>
