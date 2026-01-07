<script lang="ts">
	import { ChevronRight, ChevronDown, FolderOpen } from 'lucide-svelte';
	import ChannelLineupRow from './ChannelLineupRow.svelte';
	import type {
		ChannelLineupItemWithDetails,
		ChannelCategory,
		EpgProgram,
		EpgProgramWithProgress
	} from '$lib/types/livetv';

	interface NowNextEntry {
		now: EpgProgramWithProgress | null;
		next: EpgProgram | null;
	}

	interface Props {
		category: ChannelCategory | null;
		channels: ChannelLineupItemWithDetails[];
		selectedIds: Set<string>;
		isExpanded: boolean;
		isDropTarget: boolean;
		isDragging: boolean;
		draggedItemId: string | null;
		epgData?: Map<string, NowNextEntry>;
		onSelect: (id: string, selected: boolean) => void;
		onSelectAll: (selected: boolean) => void;
		onToggle: () => void;
		onDragStart: (e: DragEvent, itemId: string) => void;
		onDragOver: (e: DragEvent) => void;
		onDragLeave: () => void;
		onDrop: (e: DragEvent) => void;
		onReorder: (itemIds: string[]) => void;
		onDragEnd: () => void;
		onEdit: (item: ChannelLineupItemWithDetails) => void;
		onRemove: (item: ChannelLineupItemWithDetails) => void;
		onInlineEdit: (
			id: string,
			field: 'channelNumber' | 'customName',
			value: number | string | null
		) => Promise<boolean>;
	}

	let {
		category,
		channels,
		selectedIds,
		isExpanded,
		isDropTarget,
		isDragging,
		draggedItemId,
		epgData = new Map(),
		onSelect,
		onSelectAll,
		onToggle,
		onDragStart,
		onDragOver,
		onDragLeave,
		onDrop,
		onReorder,
		onDragEnd,
		onEdit,
		onRemove,
		onInlineEdit
	}: Props = $props();

	// Derived: Check if all channels in this category are selected
	const allSelected = $derived(channels.length > 0 && channels.every((c) => selectedIds.has(c.id)));
	const someSelected = $derived(
		channels.length > 0 && channels.some((c) => selectedIds.has(c.id)) && !allSelected
	);

	// Drag reorder state within this section
	let dragOverIndex = $state<number | null>(null);

	function handleSelectAllClick() {
		onSelectAll(!allSelected);
	}

	// Row drag handlers for reordering within section
	function handleRowDragOver(e: DragEvent, index: number) {
		// Only allow reorder within same category
		const item = channels.find((c) => c.id === draggedItemId);
		if (item) {
			e.preventDefault();
			dragOverIndex = index;
		}
	}

	function handleRowDragLeave() {
		dragOverIndex = null;
	}

	function handleRowDrop(e: DragEvent, dropIndex: number) {
		if (!draggedItemId) return;

		const draggedIndex = channels.findIndex((c) => c.id === draggedItemId);
		if (draggedIndex === -1 || draggedIndex === dropIndex) {
			dragOverIndex = null;
			return;
		}

		// Create new order
		const newOrder = [...channels];
		const [removed] = newOrder.splice(draggedIndex, 1);
		newOrder.splice(dropIndex, 0, removed);

		onReorder(newOrder.map((c) => c.id));
		dragOverIndex = null;
	}

	// Category header drop zone
	function handleHeaderDragOver(e: DragEvent) {
		if (isDragging) {
			e.preventDefault();
			onDragOver(e);
		}
	}

	function handleHeaderDrop(e: DragEvent) {
		e.preventDefault();
		onDrop(e);
	}
</script>

<div class="overflow-hidden">
	<!-- Category Header / Drop Zone -->
	<button
		class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-300/50
			{isDropTarget ? 'ring-dashed bg-primary/10 ring-2 ring-primary ring-inset' : ''}"
		onclick={onToggle}
		ondragover={handleHeaderDragOver}
		ondragleave={onDragLeave}
		ondrop={handleHeaderDrop}
	>
		<!-- Expand/Collapse -->
		{#if isExpanded}
			<ChevronDown class="h-4 w-4 text-base-content/50" />
		{:else}
			<ChevronRight class="h-4 w-4 text-base-content/50" />
		{/if}

		<!-- Select All Checkbox -->
		{#if channels.length > 0}
			<input
				type="checkbox"
				class="checkbox checkbox-sm"
				checked={allSelected}
				indeterminate={someSelected}
				onclick={(e) => {
					e.stopPropagation();
					handleSelectAllClick();
				}}
			/>
		{/if}

		<!-- Category Icon & Name -->
		{#if category}
			{#if category.color}
				<span class="h-3 w-3 rounded-full" style="background-color: {category.color}"></span>
			{:else}
				<FolderOpen class="h-4 w-4 text-base-content/50" />
			{/if}
			<span class="font-medium">{category.name}</span>
		{:else}
			<FolderOpen class="h-4 w-4 text-base-content/50" />
			<span class="font-medium text-base-content/70">Uncategorized</span>
		{/if}

		<!-- Channel Count -->
		<span class="text-sm text-base-content/50">({channels.length})</span>

		<!-- Drop hint when dragging -->
		{#if isDropTarget}
			<span class="ml-auto text-sm text-primary">Drop here to move</span>
		{/if}
	</button>

	<!-- Channel Rows -->
	{#if isExpanded && channels.length > 0}
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr class="text-xs text-base-content/50">
						<th class="w-10"></th>
						<th class="w-10"></th>
						<th class="w-16 text-center">#</th>
						<th class="w-12"></th>
						<th>Name</th>
						<th class="hidden md:table-cell">Source</th>
						<th class="hidden lg:table-cell">Now Playing</th>
						<th class="w-24">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each channels as channel, index (channel.id)}
						<ChannelLineupRow
							item={channel}
							{index}
							selected={selectedIds.has(channel.id)}
							isDragging={draggedItemId === channel.id}
							isDropTarget={dragOverIndex === index && draggedItemId !== channel.id}
							epgNow={epgData.get(channel.channelId)}
							onSelect={(selected) => onSelect(channel.id, selected)}
							onDragStart={(e) => onDragStart(e, channel.id)}
							onDragOver={(e) => handleRowDragOver(e, index)}
							onDragLeave={handleRowDragLeave}
							onDrop={(e) => handleRowDrop(e, index)}
							{onDragEnd}
							onEdit={() => onEdit(channel)}
							onRemove={() => onRemove(channel)}
							{onInlineEdit}
						/>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Empty category message -->
	{#if isExpanded && channels.length === 0 && category !== null}
		<div class="px-4 py-6 text-center text-sm text-base-content/50">
			No channels in this category
			{#if isDragging}
				<span class="block text-primary">Drop a channel here to add it</span>
			{/if}
		</div>
	{/if}
</div>
