<script lang="ts">
	import type { MovieDetails, TVShowDetails } from '$lib/types/tmdb';
	import MetadataFact from './MetadataFact.svelte';
	import ProductionCompanies from './ProductionCompanies.svelte';
	import WatchProviders from './WatchProviders.svelte';
	import NetworkLogos from './NetworkLogos.svelte';
	import {
		formatCurrency,
		formatLanguage,
		formatCountry,
		formatDateShort
	} from '$lib/utils/format';

	let {
		item,
		mediaType
	}: {
		item: MovieDetails | TVShowDetails;
		mediaType: 'movie' | 'tv';
	} = $props();

	const isMovie = $derived(mediaType === 'movie');
	const movie = $derived(isMovie ? (item as MovieDetails) : null);
	const tv = $derived(!isMovie ? (item as TVShowDetails) : null);
</script>

<section class="rounded-xl bg-base-200/50 p-6">
	<h2 class="mb-6 flex items-center gap-2 text-xl font-bold">
		<span class="h-6 w-1 rounded-full bg-primary"></span>
		Details
	</h2>

	<!-- Facts Grid -->
	<div
		class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
	>
		<MetadataFact label="Status" value={item.status} />

		{#if isMovie && movie}
			{#if movie.budget > 0}
				<MetadataFact label="Budget" value={formatCurrency(movie.budget)} />
			{/if}
			{#if movie.revenue > 0}
				<MetadataFact label="Box Office" value={formatCurrency(movie.revenue)} />
			{/if}
			<MetadataFact label="Release Date" value={formatDateShort(movie.release_date)} />
		{:else if tv}
			<MetadataFact label="Type" value={tv.type} />
			<MetadataFact
				label="Seasons"
				value={`${tv.number_of_seasons} ${tv.number_of_seasons === 1 ? 'Season' : 'Seasons'}`}
			/>
			<MetadataFact
				label="Episodes"
				value={`${tv.number_of_episodes} ${tv.number_of_episodes === 1 ? 'Episode' : 'Episodes'}`}
			/>
			{#if tv.in_production}
				<MetadataFact label="In Production" value="Yes" />
			{/if}
			{#if tv.last_episode_to_air}
				<MetadataFact
					label="Last Episode"
					value={`S${tv.last_episode_to_air.season_number}E${tv.last_episode_to_air.episode_number} · ${formatDateShort(tv.last_episode_to_air.air_date)}`}
				/>
			{/if}
			{#if tv.next_episode_to_air}
				<MetadataFact
					label="Next Episode"
					value={`S${tv.next_episode_to_air.season_number}E${tv.next_episode_to_air.episode_number} · ${formatDateShort(tv.next_episode_to_air.air_date)}`}
				/>
			{/if}
		{/if}

		<MetadataFact label="Original Language" value={formatLanguage(item.original_language)} />

		{#if item.spoken_languages && item.spoken_languages.length > 1}
			<MetadataFact
				label="Spoken Languages"
				value={item.spoken_languages.map((l) => l.english_name).join(', ')}
			/>
		{/if}
	</div>

	<!-- Production Countries -->
	{#if item.production_countries && item.production_countries.length > 0}
		<div class="mt-6 border-t border-base-content/10 pt-6">
			<h3 class="mb-3 text-sm font-medium text-white/60">
				{item.production_countries.length === 1 ? 'Production Country' : 'Production Countries'}
			</h3>
			<div class="flex flex-wrap gap-2">
				{#each item.production_countries as country (country.iso_3166_1)}
					<span class="badge badge-ghost">{formatCountry(country.iso_3166_1)}</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Networks (TV only) -->
	{#if tv?.networks && tv.networks.length > 0}
		<div class="mt-6 border-t border-base-content/10 pt-6">
			<h3 class="mb-3 text-sm font-medium text-white/60">Networks</h3>
			<NetworkLogos networks={tv.networks} />
		</div>
	{/if}

	<!-- Production Companies -->
	{#if item.production_companies && item.production_companies.length > 0}
		<div class="mt-6 border-t border-base-content/10 pt-6">
			<h3 class="mb-3 text-sm font-medium text-white/60">Production Companies</h3>
			<ProductionCompanies companies={item.production_companies} />
		</div>
	{/if}

	<!-- Watch Providers -->
	{#if item['watch/providers']}
		<div class="mt-6 border-t border-base-content/10 pt-6">
			<h3 class="mb-3 text-sm font-medium text-white/60">Where to Watch</h3>
			<WatchProviders providers={item['watch/providers']} />
		</div>
	{/if}
</section>
