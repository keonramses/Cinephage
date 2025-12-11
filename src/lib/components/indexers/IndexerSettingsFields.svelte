<script lang="ts">
	import type { DefinitionSetting } from '$lib/types/indexer';
	import { HelpCircle } from 'lucide-svelte';

	interface Props {
		settingsDefinitions: DefinitionSetting[];
		settings: Record<string, string>;
	}

	let { settingsDefinitions, settings = $bindable() }: Props = $props();

	function updateSetting(name: string, value: string) {
		settings[name] = value;
	}
</script>

{#if settingsDefinitions.length > 0}
	{#each settingsDefinitions as setting (setting.name)}
		<div class="form-control">
			<label class="label py-1" for={setting.name}>
				<span class="label-text flex items-center gap-1">
					{setting.label}
					{#if setting.required}
						<span class="text-error">*</span>
					{/if}
					{#if setting.helpText}
						<div class="tooltip tooltip-right" data-tip={setting.helpText}>
							<HelpCircle class="h-3.5 w-3.5 text-base-content/50" />
						</div>
					{/if}
				</span>
			</label>

			{#if setting.type === 'password'}
				<input
					type="password"
					id={setting.name}
					class="input-bordered input input-sm"
					placeholder={String(setting.default ?? '')}
					value={settings[setting.name] ?? ''}
					oninput={(e) => updateSetting(setting.name, e.currentTarget.value)}
					required={setting.required}
				/>
			{:else if setting.type === 'checkbox'}
				<label class="label cursor-pointer justify-start gap-2 py-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={settings[setting.name] === 'true'}
						onchange={(e) =>
							updateSetting(setting.name, e.currentTarget.checked ? 'true' : 'false')}
					/>
				</label>
			{:else if setting.type === 'select' && setting.options}
				<select
					id={setting.name}
					class="select-bordered select select-sm"
					value={settings[setting.name] ?? String(setting.default ?? '')}
					onchange={(e) => updateSetting(setting.name, e.currentTarget.value)}
				>
					{#each Object.entries(setting.options) as [value, label] (value)}
						<option {value}>{label}</option>
					{/each}
				</select>
			{:else if setting.type === 'number'}
				<input
					type="number"
					id={setting.name}
					class="input-bordered input input-sm"
					placeholder={String(setting.default ?? '')}
					value={settings[setting.name] ?? ''}
					oninput={(e) => updateSetting(setting.name, e.currentTarget.value)}
					required={setting.required}
				/>
			{:else}
				<input
					type="text"
					id={setting.name}
					class="input-bordered input input-sm"
					placeholder={String(setting.default ?? '')}
					value={settings[setting.name] ?? ''}
					oninput={(e) => updateSetting(setting.name, e.currentTarget.value)}
					required={setting.required}
				/>
			{/if}

			{#if setting.helpText}
				<div class="label py-0.5">
					<span class="label-text-alt text-base-content/60">{setting.helpText}</span>
				</div>
			{/if}
		</div>
	{/each}
{/if}
