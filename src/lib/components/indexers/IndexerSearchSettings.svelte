<script lang="ts">
	interface Props {
		enableAutomaticSearch: boolean;
		enableInteractiveSearch: boolean;
	}

	let { enableAutomaticSearch = $bindable(), enableInteractiveSearch = $bindable() }: Props =
		$props();
</script>

<div class="divider text-sm text-base-content/60">Search Capabilities</div>

<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
	<label class="flex cursor-pointer flex-col items-start gap-1 py-2">
		<span class="text-xs text-base-content/60">Auto Search</span>
		<input
			type="checkbox"
			class="toggle toggle-primary toggle-sm"
			bind:checked={enableAutomaticSearch}
		/>
	</label>
	<label class="flex cursor-pointer flex-col items-start gap-1 py-2">
		<span class="text-xs text-base-content/60">Interactive</span>
		<input
			type="checkbox"
			class="toggle toggle-primary toggle-sm"
			bind:checked={enableInteractiveSearch}
		/>
	</label>
</div>
