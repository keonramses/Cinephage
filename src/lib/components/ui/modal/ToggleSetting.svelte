<script lang="ts">
	interface Props {
		checked: boolean;
		label: string;
		description?: string;
		disabled?: boolean;
		onchange?: () => void;
	}

	let { checked = $bindable(), label, description, disabled = false, onchange }: Props = $props();

	function handleChange() {
		if (onchange) {
			onchange();
		}
	}
</script>

<label class="label cursor-pointer justify-start gap-3 py-2">
	<input
		type="checkbox"
		class="checkbox checkbox-sm"
		bind:checked
		{disabled}
		onchange={handleChange}
	/>
	<div>
		<span class="label-text">{label}</span>
		{#if description}
			<p class="text-xs text-base-content/50">{description}</p>
		{/if}
	</div>
</label>
