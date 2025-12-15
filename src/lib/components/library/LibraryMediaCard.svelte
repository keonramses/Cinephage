<script lang="ts">
	import type { LibraryMovie, LibrarySeries } from '$lib/types/library';
	import { isLibraryMovie, getBestQualityFromFiles } from '$lib/types/library';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import { Eye, EyeOff, Check, X } from 'lucide-svelte';
	import { resolvePath } from '$lib/utils/routing';

	type LibraryItem = LibraryMovie | LibrarySeries;

	let { item }: { item: LibraryItem } = $props();

	const isMovie = $derived(isLibraryMovie(item));
	// Link to library management pages using library database ID
	const link = $derived(isMovie ? `/library/movie/${item.id}` : `/library/tv/${item.id}`);

	// For movies: get file status and quality
	const movieQuality = $derived(
		isMovie ? getBestQualityFromFiles((item as LibraryMovie).files) : null
	);
	const hasFile = $derived(isMovie ? (item as LibraryMovie).hasFile : false);

	// For series: get progress
	const seriesProgress = $derived(!isMovie ? (item as LibrarySeries).percentComplete : 0);
	const episodeCount = $derived(!isMovie ? (item as LibrarySeries).episodeCount : 0);
	const episodeFileCount = $derived(!isMovie ? (item as LibrarySeries).episodeFileCount : 0);

	// Quality badge display
	const qualityBadge = $derived(() => {
		if (!isMovie || !movieQuality) return null;
		const parts: string[] = [];
		if (movieQuality.quality) parts.push(movieQuality.quality);
		if (movieQuality.hdr) parts.push(movieQuality.hdr);
		return parts.length > 0 ? parts.join(' ') : null;
	});
</script>

<a
	href={resolvePath(link)}
	class="group relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-base-300 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-primary/50"
>
	<TmdbImage
		path={item.posterPath}
		size="w342"
		alt={item.title}
		class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
	/>

	<!-- Top-right badges: Monitored + Type -->
	<div class="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
		<!-- Monitored status -->
		<div
			class="badge border-none badge-sm shadow-sm backdrop-blur-sm {item.monitored
				? 'bg-success/80 text-success-content'
				: 'bg-base-300/80 text-base-content/60'}"
			title={item.monitored ? 'Monitored' : 'Not Monitored'}
		>
			{#if item.monitored}
				<Eye class="h-3 w-3" />
			{:else}
				<EyeOff class="h-3 w-3" />
			{/if}
		</div>

		<!-- Media type badge -->
		<div
			class="badge border-none badge-sm font-semibold shadow-sm backdrop-blur-sm {isMovie
				? 'bg-primary/80 text-primary-content'
				: 'bg-secondary/80 text-secondary-content'}"
		>
			{isMovie ? 'Movie' : 'TV'}
		</div>
	</div>

	<!-- Top-left: File status (movies) or Progress indicator (series) -->
	<div class="absolute top-2 left-2 z-10 flex flex-col gap-1">
		{#if isMovie}
			<!-- File status for movies -->
			<div
				class="badge border-none badge-sm shadow-sm backdrop-blur-sm {hasFile
					? 'bg-success/80 text-success-content'
					: 'bg-error/80 text-error-content'}"
				title={hasFile ? 'File available' : 'Missing file'}
			>
				{#if hasFile}
					<Check class="h-3 w-3" />
				{:else}
					<X class="h-3 w-3" />
				{/if}
			</div>
		{:else}
			<!-- Episode count for series -->
			<div
				class="badge border-none bg-base-100/80 badge-sm text-base-content shadow-sm backdrop-blur-sm"
				title="{episodeFileCount} of {episodeCount} episodes"
			>
				{episodeFileCount}/{episodeCount}
			</div>
		{/if}

		<!-- Quality badge for movies with files -->
		{#if isMovie && hasFile && qualityBadge()}
			<div
				class="badge border-none bg-primary/80 badge-sm font-medium text-primary-content shadow-sm backdrop-blur-sm"
			>
				{qualityBadge()}
			</div>
		{/if}
	</div>

	<!-- Series progress bar -->
	{#if !isMovie}
		<div class="absolute right-0 bottom-0 left-0 h-1 bg-base-300/50">
			<div
				class="h-full transition-all duration-300 {seriesProgress === 100
					? 'bg-success'
					: seriesProgress > 0
						? 'bg-primary'
						: 'bg-base-300'}"
				style="width: {seriesProgress}%"
			></div>
		</div>
	{/if}

	<!-- Hover Overlay -->
	<div
		class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
	>
		<div
			class="translate-y-4 transform transition-transform duration-300 group-hover:translate-y-0"
		>
			<h3 class="line-clamp-2 text-sm leading-tight font-bold text-white">
				{item.title}
			</h3>
			<div class="mt-1 flex items-center justify-between">
				{#if item.year}
					<span class="text-xs text-white/70">{item.year}</span>
				{/if}
				{#if !isMovie}
					<span class="text-xs text-white/70">{seriesProgress}% complete</span>
				{/if}
			</div>
		</div>
	</div>
</a>
