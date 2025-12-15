<script lang="ts">
	import type { PageData } from './$types';
	import SmartListEditor from '$lib/components/smartlists/SmartListEditor.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Edit {data.list.name} - Cinephage</title>
</svelte:head>

<SmartListEditor
	list={data.list}
	rootFolders={data.rootFolders}
	scoringProfiles={data.scoringProfiles}
/>
