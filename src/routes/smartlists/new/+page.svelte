<script lang="ts">
	import type { PageData } from './$types';
	import SmartListEditor from '$lib/components/smartlists/SmartListEditor.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Create Smart List - Cinephage</title>
</svelte:head>

<SmartListEditor
	rootFolders={data.rootFolders}
	scoringProfiles={data.scoringProfiles}
/>
