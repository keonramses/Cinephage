<script lang="ts">
	import { enhance } from '$app/forms';
	import { HardDrive, Trash2, RefreshCw, Archive, Clock } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let cleaning = $state(false);
</script>

<svelte:head>
	<title>Streaming Settings - Cinephage</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center gap-3">
		<Archive size={28} class="text-primary" />
		<h1 class="text-2xl font-bold">Streaming Settings</h1>
	</div>

	<!-- Extraction Cache Section -->
	<div class="card mb-6 bg-base-200">
		<div class="card-body">
			<h2 class="card-title">
				<HardDrive size={20} />
				Extraction Cache
			</h2>
			<p class="mb-4 text-sm text-base-content/70">
				Compressed Usenet releases are downloaded and extracted locally for streaming. Extracted
				files are cached to enable instant playback on subsequent views.
			</p>

			<!-- Cache Stats -->
			<div class="stats stats-vertical bg-base-100 shadow lg:stats-horizontal">
				<div class="stat">
					<div class="stat-figure text-primary">
						<Archive size={24} />
					</div>
					<div class="stat-title">Cached Files</div>
					<div class="stat-value text-primary">{data.cacheStats.fileCount}</div>
				</div>

				<div class="stat">
					<div class="stat-figure text-secondary">
						<HardDrive size={24} />
					</div>
					<div class="stat-title">Cache Size</div>
					<div class="stat-value text-secondary">
						{data.cacheStats.totalSizeMB >= 1024
							? `${(data.cacheStats.totalSizeMB / 1024).toFixed(1)} GB`
							: `${data.cacheStats.totalSizeMB} MB`}
					</div>
				</div>

				<div class="stat">
					<div class="stat-figure text-warning">
						<Clock size={24} />
					</div>
					<div class="stat-title">Expired</div>
					<div class="stat-value text-warning">{data.cacheStats.expiredCount}</div>
					<div class="stat-desc">pending cleanup</div>
				</div>
			</div>

			<!-- Cleanup Action -->
			<div class="mt-4">
				{#if form?.success}
					<div class="mb-4 alert alert-success">
						<span>
							Cleaned up {form.cleaned} file(s), freed {form.freedMB >= 1024
								? `${(form.freedMB / 1024).toFixed(1)} GB`
								: `${form.freedMB} MB`}
						</span>
					</div>
				{/if}

				<form
					method="POST"
					action="?/cleanup"
					use:enhance={() => {
						cleaning = true;
						return async ({ update }) => {
							await update();
							cleaning = false;
						};
					}}
				>
					<button class="btn gap-2 btn-outline btn-warning" disabled={cleaning}>
						{#if cleaning}
							<RefreshCw size={16} class="animate-spin" />
							Cleaning...
						{:else}
							<Trash2 size={16} />
							Clean Expired Files
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>

	<!-- Cache Settings -->
	<div class="card bg-base-200">
		<div class="card-body">
			<h2 class="card-title">
				<Clock size={20} />
				Cache Settings
			</h2>

			<div class="form-control w-full max-w-xs">
				<label class="label" for="retention">
					<span class="label-text">Retention Period</span>
				</label>
				<select id="retention" class="select-bordered select" disabled>
					<option value="24">24 hours</option>
					<option value="48" selected>48 hours (default)</option>
					<option value="72">72 hours</option>
					<option value="168">1 week</option>
				</select>
				<label class="label">
					<span class="label-text-alt text-base-content/50">
						Extracted files are automatically deleted after this period
					</span>
				</label>
			</div>

			<div class="mt-4 alert alert-info">
				<span>
					Cache settings are currently using defaults. Custom configuration coming soon.
				</span>
			</div>
		</div>
	</div>

	<!-- How It Works -->
	<div class="card mt-6 bg-base-200">
		<div class="card-body">
			<h2 class="card-title">How Extraction Works</h2>
			<div class="prose-sm prose max-w-none">
				<ol class="space-y-2">
					<li>
						<strong>Detection:</strong> When you select a Usenet release for streaming, the system checks
						if the content is compressed (RAR, 7z, ZIP).
					</li>
					<li>
						<strong>Download:</strong> Compressed content is downloaded from your NNTP servers with parallel
						segment fetching for maximum speed.
					</li>
					<li>
						<strong>Extraction:</strong> The archive is extracted to your root folder's extraction cache
						directory.
					</li>
					<li>
						<strong>Streaming:</strong> Once extracted, the media file is available for instant playback
						with full seeking support.
					</li>
					<li>
						<strong>Cleanup:</strong> Extracted files are automatically removed after the retention period
						to save disk space.
					</li>
				</ol>
			</div>
		</div>
	</div>
</div>
