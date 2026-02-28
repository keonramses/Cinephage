<script lang="ts">
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import TmdbConfigRequired from '$lib/components/ui/TmdbConfigRequired.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { GlobalTmdbFilters } from '$lib/types/tmdb';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let filtersState = $state<GlobalTmdbFilters>({
		include_adult: false,
		min_vote_average: 0,
		min_vote_count: 0,
		language: 'en-US',
		region: 'US',
		excluded_genre_ids: []
	});
	let saving = $state(false);
	let saveSuccess = $state(false);

	const languages = [
		{ code: 'en-US', name: 'English (US)' },
		{ code: 'en-GB', name: 'English (UK)' },
		{ code: 'fr-FR', name: 'French' },
		{ code: 'de-DE', name: 'German' },
		{ code: 'es-ES', name: 'Spanish' },
		{ code: 'ja-JP', name: 'Japanese' },
		{ code: 'ko-KR', name: 'Korean' }
	];

	const regions = [
		{ code: 'US', name: 'United States' },
		{ code: 'GB', name: 'United Kingdom' },
		{ code: 'FR', name: 'France' },
		{ code: 'DE', name: 'Germany' },
		{ code: 'ES', name: 'Spain' },
		{ code: 'JP', name: 'Japan' },
		{ code: 'KR', name: 'South Korea' }
	];

	function toggleExcludedGenre(genreId: number, checked: boolean) {
		if (checked) {
			if (!filtersState.excluded_genre_ids.includes(genreId)) {
				filtersState.excluded_genre_ids = [...filtersState.excluded_genre_ids, genreId];
			}
		} else {
			filtersState.excluded_genre_ids = filtersState.excluded_genre_ids.filter(
				(currentGenreId) => currentGenreId !== genreId
			);
		}
		saveSuccess = false;
	}

	async function handleSave() {
		saving = true;
		saveSuccess = false;

		try {
			const response = await fetch('/api/settings/filters', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(filtersState)
			});
			const result = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				throw new Error(getResponseErrorMessage(result, 'Failed to save global filters'));
			}

			saveSuccess = true;
			toasts.success('Global filters updated');
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to save global filters');
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		filtersState = { ...data.filters };
	});
</script>

<svelte:head>
	<title>Global Filters - Settings - Cinephage</title>
</svelte:head>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Global Filters</h1>
		<p class="text-base-content/70">
			Configure global content filters. These settings apply to all search results, discoveries, and
			automated tasks.
		</p>
	</div>

	{#if !data.tmdbConfigured}
		<div class="mb-6">
			<TmdbConfigRequired
				message="Configure your TMDB API key to enable genre filtering and other TMDB-powered features."
			/>
		</div>
	{/if}

	<div class="space-y-8">
		<!-- Content Settings -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">Content Preferences</h2>
				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-4">
						<input
							type="checkbox"
							class="checkbox checkbox-primary"
							bind:checked={filtersState.include_adult}
							onchange={() => (saveSuccess = false)}
						/>
						<span class="label-text">Include Adult Content</span>
					</label>
					<p class="pl-10 text-xs text-base-content/60">
						Enable to allow adult content in search results and discovery.
					</p>
				</div>
			</div>
		</div>

		<!-- Quality Settings -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">Quality Standards</h2>
				<div class="grid gap-6 md:grid-cols-2">
					<div class="form-control">
						<label class="label" for="min_vote_average">
							<span class="label-text">Minimum Score (0-10)</span>
						</label>
						<input
							type="number"
							id="min_vote_average"
							min="0"
							max="10"
							step="0.1"
							bind:value={filtersState.min_vote_average}
							class="input-bordered input w-full"
							oninput={() => (saveSuccess = false)}
						/>
					</div>
					<div class="form-control">
						<label class="label" for="min_vote_count">
							<span class="label-text">Minimum Vote Count</span>
						</label>
						<input
							type="number"
							id="min_vote_count"
							min="0"
							bind:value={filtersState.min_vote_count}
							class="input-bordered input w-full"
							oninput={() => (saveSuccess = false)}
						/>
					</div>
				</div>
			</div>
		</div>

		<!-- Localization -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">Localization</h2>
				<div class="grid gap-6 md:grid-cols-2">
					<div class="form-control">
						<label class="label" for="language">
							<span class="label-text">Preferred Language</span>
						</label>
						<select
							id="language"
							class="select-bordered select w-full"
							bind:value={filtersState.language}
							onchange={() => (saveSuccess = false)}
						>
							{#each languages as lang (lang.code)}
								<option value={lang.code}>{lang.name}</option>
							{/each}
						</select>
					</div>
					<div class="form-control">
						<label class="label" for="region">
							<span class="label-text">Preferred Region</span>
						</label>
						<select
							id="region"
							class="select-bordered select w-full"
							bind:value={filtersState.region}
							onchange={() => (saveSuccess = false)}
						>
							{#each regions as region (region.code)}
								<option value={region.code}>{region.name}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</div>

		<!-- Genre Exclusion -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">Excluded Genres</h2>
				<p class="mb-4 text-sm text-base-content/70">Select genres to exclude from all results.</p>
				{#if data.genres.length === 0}
					<p class="text-sm text-base-content/50 italic">
						{#if !data.tmdbConfigured}
							Configure your TMDB API key to load available genres.
						{:else}
							No genres available.
						{/if}
					</p>
				{:else}
					<div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
						{#each data.genres as genre (genre.id)}
							<label class="label cursor-pointer justify-start gap-2">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={filtersState.excluded_genre_ids.includes(genre.id)}
									onchange={(event) => toggleExcludedGenre(genre.id, event.currentTarget.checked)}
								/>
								<span class="label-text">{genre.name}</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if saveSuccess}
			<div class="alert alert-success shadow-lg">
				<span>Global filters updated successfully.</span>
			</div>
		{/if}

		<div class="flex justify-end">
			<button class="btn btn-primary" onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save Global Filters'}
			</button>
		</div>
	</div>
</div>
