<script lang="ts">
	import type { Indexer } from '$lib/types/indexer';
	import { SectionHeader, ToggleSetting } from '$lib/components/ui/modal';

	interface Props {
		indexer: Indexer;
		url: string;
		urlError: string;
		priority: number;
		enabled: boolean;
		enableAutomaticSearch: boolean;
		enableInteractiveSearch: boolean;
		isStreaming: boolean;
		onUrlChange: (value: string) => void;
		onUrlBlur: () => void;
		onPriorityChange: (value: number) => void;
		onEnabledChange: (value: boolean) => void;
		onAutomaticSearchChange: (value: boolean) => void;
		onInteractiveSearchChange: (value: boolean) => void;
	}

	let {
		indexer: _indexer,
		url,
		urlError,
		priority,
		enabled,
		enableAutomaticSearch,
		enableInteractiveSearch,
		isStreaming,
		onUrlChange,
		onUrlBlur,
		onPriorityChange,
		onEnabledChange,
		onAutomaticSearchChange,
		onInteractiveSearchChange
	}: Props = $props();
</script>

<div class="space-y-4">
	<!-- External URL for streaming access -->
	{#if isStreaming}
		<div class="form-control">
			<label class="label py-1" for="internal-url">
				<span class="label-text">External URL</span>
				<span class="label-text-alt text-xs">Required for streaming</span>
			</label>
			<input
				id="internal-url"
				type="url"
				class="input-bordered input input-sm {urlError ? 'input-error' : ''}"
				value={url}
				oninput={(e) => onUrlChange(e.currentTarget.value)}
				onblur={onUrlBlur}
				placeholder="http://192.168.1.100:3000"
			/>
			{#if urlError}
				<p class="label py-0">
					<span class="label-text-alt text-error">{urlError}</span>
				</p>
			{:else}
				<p class="label py-0">
					<span class="label-text-alt text-xs">
						The external URL where Jellyfin/Kodi can reach this server
					</span>
				</p>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
		<div class="form-control">
			<label class="label py-1" for="internal-priority">
				<span class="label-text">Priority</span>
				<span class="label-text-alt text-xs">1-100</span>
			</label>
			<input
				id="internal-priority"
				type="number"
				class="input-bordered input input-sm"
				value={priority}
				oninput={(e) => onPriorityChange(parseInt(e.currentTarget.value) || 25)}
				min="1"
				max="100"
			/>
			<p class="label py-0">
				<span class="label-text-alt text-xs">Lower = higher priority</span>
			</p>
		</div>

		<div>
			<span class="block py-1 text-sm">Status</span>
			<label class="flex cursor-pointer items-center gap-2 py-2">
				<input
					type="checkbox"
					class="toggle shrink-0 toggle-sm"
					checked={enabled}
					onchange={(e) => onEnabledChange(e.currentTarget.checked)}
				/>
				<span class="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
			</label>
		</div>
	</div>

	<SectionHeader title="Search Settings" class="mt-2" />
	<div class="space-y-2">
		<ToggleSetting
			checked={enableAutomaticSearch}
			label="Automatic Search"
			description="Search when items are added or upgraded"
			onchange={() => onAutomaticSearchChange(!enableAutomaticSearch)}
		/>
		<ToggleSetting
			checked={enableInteractiveSearch}
			label="Interactive Search"
			description="Manual searches from the UI"
			onchange={() => onInteractiveSearchChange(!enableInteractiveSearch)}
		/>
	</div>

	{#if isStreaming}
		<div class="mt-4 rounded-lg bg-info/10 p-4">
			<p class="text-sm text-base-content/70">
				Streaming provides instant playback via .strm files without needing a torrent client.
			</p>
		</div>
	{/if}
</div>
