<script lang="ts">
	import type { PageData } from './$types';
	import MediaHero from '$lib/components/tmdb/MediaHero.svelte';
	import PersonCard from '$lib/components/tmdb/PersonCard.svelte';
	import SeasonList from '$lib/components/tmdb/SeasonList.svelte';
	import SectionRow from '$lib/components/discover/SectionRow.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.tv.name} - Cinephage</title>
</svelte:head>

<div class="flex w-full flex-col gap-12 px-4 pb-20 lg:px-8">
	<!-- Hero Section -->
	<MediaHero item={data.tv} />

	<!-- Cast Section -->
	{#if data.tv.credits.cast.length > 0}
		<SectionRow
			title="Top Cast"
			items={data.tv.credits.cast.slice(0, 15)}
			itemClass="w-[30vw] sm:w-36 md:w-44"
		>
			{#snippet cardSnippet(person)}
				<PersonCard {person} />
			{/snippet}
		</SectionRow>
	{/if}

	<!-- Seasons Section -->
	{#if data.tv.seasons.length > 0}
		<section>
			<h2 class="mb-6 text-2xl font-bold">Seasons</h2>
			<SeasonList seasons={data.tv.seasons} />
		</section>
	{/if}

	<!-- Recommendations -->
	{#if data.tv.recommendations.results.length > 0}
		<SectionRow
			title="Recommendations"
			items={data.tv.recommendations.results}
			endpoint={`tv/${data.tv.id}/recommendations`}
		/>
	{/if}

	<!-- Similar -->
	{#if data.tv.similar.results.length > 0}
		<SectionRow
			title="Similar Titles"
			items={data.tv.similar.results}
			endpoint={`tv/${data.tv.id}/similar`}
		/>
	{/if}
</div>
