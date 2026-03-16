<script lang="ts">
	import { Loader2, RefreshCw, Clock3, CircleAlert, CheckCircle2, Zap } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface SubtitleItem {
		id: string;
		language: string;
		format?: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		matchScore?: number | null;
		dateAdded?: string | null;
		wasSynced?: boolean;
		syncOffset?: number | null;
	}

	interface SyncSettings {
		splitPenalty: number;
		noSplits: boolean;
	}

	interface Props {
		open: boolean;
		title: string;
		subtitles: SubtitleItem[];
		syncingSubtitleId?: string | null;
		errorMessage?: string | null;
		onClose: () => void;
		onSync: (subtitleId: string, settings: SyncSettings) => void;
	}

	let {
		open,
		title,
		subtitles,
		syncingSubtitleId = null,
		errorMessage = null,
		onClose,
		onSync
	}: Props = $props();

	let splitPenalty = $state(7);
	let noSplits = $state(false);

	function formatOffset(syncOffset?: number | null): string {
		if (syncOffset === null || syncOffset === undefined) {
			return 'Not synced yet';
		}

		const seconds = syncOffset / 1000;
		const rounded = Math.abs(seconds) >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
		const prefix = seconds > 0 ? '+' : '';
		return `${prefix}${rounded}s`;
	}

	function formatDate(date?: string | null): string {
		if (!date) return 'Unknown';
		return new Date(date).toLocaleString();
	}

	function handleSync(subtitleId: string) {
		onSync(subtitleId, { splitPenalty, noSplits });
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="3xl" labelledBy="subtitle-sync-modal-title">
	<div class="mb-4 flex items-center justify-between gap-4">
		<div>
			<h3 id="subtitle-sync-modal-title" class="text-lg font-bold">Subtitle Sync</h3>
			<p class="text-sm text-base-content/60">{title}</p>
		</div>
		<button class="btn btn-ghost btn-sm" onclick={onClose}>Close</button>
	</div>

	{#if errorMessage}
		<div class="mb-4 alert alert-error">
			<CircleAlert size={16} />
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Sync Settings -->
	<div class="mb-4 rounded-lg border border-base-300 bg-base-200/40 p-4">
		<h4 class="mb-3 text-sm font-semibold">Sync Settings</h4>

		<div class="space-y-3">
			<!-- No-splits toggle -->
			<label class="flex cursor-pointer items-center gap-3">
				<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={noSplits} />
				<div>
					<span class="text-sm font-medium">Offset only (fast)</span>
					<p class="text-xs text-base-content/60">
						Apply a constant time shift without introducing splits. Much faster.
					</p>
				</div>
				{#if noSplits}
					<Zap size={14} class="ml-auto text-warning" />
				{/if}
			</label>

			<!-- Split penalty slider (hidden when noSplits is on) -->
			{#if !noSplits}
				<div>
					<div class="mb-1 flex items-center justify-between">
						<label for="split-penalty" class="text-sm font-medium">Split Penalty</label>
						<span class="font-mono text-sm text-base-content/70">{splitPenalty}</span>
					</div>
					<input
						id="split-penalty"
						type="range"
						class="range w-full range-primary range-xs"
						min="0"
						max="30"
						step="1"
						bind:value={splitPenalty}
					/>
					<div class="mt-1 flex justify-between text-xs text-base-content/50">
						<span>More splits</span>
						<span>5-20 recommended</span>
						<span>Fewer splits</span>
					</div>
					<p class="mt-1 text-xs text-base-content/60">
						Controls how aggressively alass handles ad breaks or different cuts. Default: 7.
					</p>
				</div>
			{/if}
		</div>
	</div>

	{#if subtitles.length === 0}
		<div
			class="rounded-lg border border-dashed border-base-300 bg-base-200/60 p-8 text-center text-sm text-base-content/60"
		>
			No downloaded subtitle files are available for sync yet.
		</div>
	{:else}
		<div class="space-y-3">
			{#each subtitles as subtitle (subtitle.id)}
				<div class="rounded-lg border border-base-300 bg-base-100 p-4">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div class="space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<span class="badge badge-outline">{subtitle.language.toUpperCase()}</span>
								{#if subtitle.format}
									<span class="badge badge-ghost">{subtitle.format.toUpperCase()}</span>
								{/if}
								{#if subtitle.isForced}
									<span class="badge badge-soft badge-secondary">Forced</span>
								{/if}
								{#if subtitle.isHearingImpaired}
									<span class="badge badge-soft badge-info">HI</span>
								{/if}
								{#if subtitle.wasSynced}
									<span class="badge badge-soft badge-accent">
										<CheckCircle2 size={12} />
										Synced
									</span>
								{/if}
							</div>

							<div class="grid gap-1 text-sm text-base-content/70">
								<div class="flex items-center gap-2">
									<Clock3 size={14} class="text-base-content/50" />
									<span>Offset: {formatOffset(subtitle.syncOffset)}</span>
								</div>
								<div>Added: {formatDate(subtitle.dateAdded)}</div>
								{#if subtitle.matchScore !== null && subtitle.matchScore !== undefined}
									<div>Match score: {subtitle.matchScore}</div>
								{/if}
							</div>
						</div>

						<button
							class="btn gap-2 btn-sm btn-primary"
							onclick={() => handleSync(subtitle.id)}
							disabled={syncingSubtitleId === subtitle.id}
						>
							{#if syncingSubtitleId === subtitle.id}
								<Loader2 size={14} class="animate-spin" />
								Syncing
							{:else}
								<RefreshCw size={14} />
								Re-sync
							{/if}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</ModalWrapper>
