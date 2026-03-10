<script lang="ts">
	import { CheckCircle, XCircle, Loader2 } from 'lucide-svelte';

	type Status = 'idle' | 'searching' | 'success' | 'failed';

	interface Props {
		status: Status;
		releaseName?: string | null;
		error?: string | null;
		size?: 'xs' | 'sm' | 'md';
	}

	let { status, releaseName = null, error = null, size = 'sm' }: Props = $props();

	const iconSizes = {
		xs: 12,
		sm: 14,
		md: 16
	};

	function getMobileErrorMessage(message: string | null): string {
		const text = message?.trim();
		if (!text) return 'Search failed';

		if (text.includes('Cinephage Library indexer is disabled')) {
			return 'Indexer disabled. Enable Cinephage indexer.';
		}

		if (text.includes('Streamer profile requires the Cinephage Library indexer')) {
			return 'Streamer requires Cinephage indexer.';
		}

		if (text.includes('Cinephage Library indexer has automatic search disabled')) {
			return 'Enable auto search on Cinephage indexer.';
		}

		if (text.length > 72) {
			return `${text.slice(0, 69)}...`;
		}

		return text;
	}

	const mobileErrorTip = $derived.by(() => getMobileErrorMessage(error));
</script>

{#if status === 'searching'}
	<div class="tooltip" data-tip="Searching...">
		<Loader2 size={iconSizes[size]} class="animate-spin text-primary" />
	</div>
{:else if status === 'success'}
	<div class="tooltip" data-tip={releaseName || 'Release grabbed'}>
		<CheckCircle size={iconSizes[size]} class="text-success" />
	</div>
{:else if status === 'failed'}
	<div
		class="tooltip tooltip-bottom tooltip-error before:max-w-[14rem] before:text-left before:text-xs before:break-words before:whitespace-normal sm:hidden"
		data-tip={mobileErrorTip}
	>
		<XCircle size={iconSizes[size]} class="text-error" />
	</div>
	<div
		class="tooltip tooltip-left hidden tooltip-error before:max-w-80 before:text-left before:break-words before:whitespace-normal sm:block"
		data-tip={error || 'Search failed'}
	>
		<XCircle size={iconSizes[size]} class="text-error" />
	</div>
{/if}
