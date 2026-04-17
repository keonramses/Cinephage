# Media Explorer Filter Bar Redesign + Playback Column

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Media Explorer's 11 cluttered filter dropdowns with a tiered chip + expandable filter system, and add `isPlayed`/`playedPercentage` playback indicators to the media table.

**Architecture:** Two-tier filter bar — primary filter chips always visible, quality/technical filters behind an expandable toggle. Playback column merges isPlayed checkmark, play count, and playedPercentage progress bar into a single cell. Server-side query extended to aggregate the two new fields from `mediaServerSyncedItems`.

**Tech Stack:** Svelte 5 (runes), DaisyUI, Tailwind CSS, Drizzle ORM, Zod

---

## File Structure

| File                                                       | Action | Responsibility                                                                              |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `src/routes/settings/general/status/media/+page.server.ts` | Modify | Add `isPlayed`/`playedPercentage` to query aggregation and `MediaExplorerItem` type         |
| `src/routes/settings/general/status/media/+page.svelte`    | Modify | Replace 11 inline dropdowns with tiered filter bar (chips + expandable section)             |
| `src/lib/components/status/MediaExplorerTable.svelte`      | Modify | Redesign Plays column → Playback column with isPlayed + playedPercentage (desktop + mobile) |

---

### Task 1: Extend server query with isPlayed and playedPercentage

**Files:**

- Modify: `src/routes/settings/general/status/media/+page.server.ts`

- [ ] **Step 1: Add isPlayed and playedPercentage to the playStatsRows query**

In the `playStatsRows` query (around line 152), add `MAX(isPlayed)` and `MAX(playedPercentage)` aggregations:

```typescript
db.select({
	tmdbId: mediaServerSyncedItems.tmdbId,
	playCount: sql<number>`COALESCE(SUM(${mediaServerSyncedItems.playCount}), 0)`,
	lastPlayedDate: sql<string | null>`MAX(${mediaServerSyncedItems.lastPlayedDate})`,
	isPlayed: sql<number>`MAX(${mediaServerSyncedItems.isPlayed})`,
	playedPercentage: sql<number | null>`MAX(${mediaServerSyncedItems.playedPercentage})`
})
	.from(mediaServerSyncedItems)
	.where(sql`${mediaServerSyncedItems.tmdbId} IS NOT NULL`)
	.groupBy(mediaServerSyncedItems.tmdbId);
```

- [ ] **Step 2: Add isPlayed and playedPercentage to MediaExplorerItem type**

Update the type (lines 14-39) to include the new fields:

```typescript
export type MediaExplorerItem = {
	id: string;
	tmdbId: number;
	title: string;
	year: number | null;
	mediaType: 'movie' | 'tv';
	mediaSubType: 'standard' | 'anime';
	libraryId: string | null;
	libraryName: string;
	rootFolderId: string | null;
	rootFolderName: string | null;
	monitored: boolean;
	hasFile: boolean;
	fileSize: number;
	resolution: string | null;
	videoCodec: string | null;
	hdrFormat: string | null;
	audioCodec: string | null;
	containerFormat: string | null;
	addedAt: string | null;
	playCount: number;
	lastPlayedDate: string | null;
	isPlayed: boolean;
	playedPercentage: number | null;
	episodeCount: number | null;
	episodeFileCount: number | null;
	posterPath: string | null;
};
```

- [ ] **Step 3: Wire up the new fields in movie item building**

In the movie push block (around line 197-222), add the two new fields:

```typescript
allItems.push({
	// ... existing fields ...
	playCount: Number(plays?.playCount ?? 0),
	lastPlayedDate: plays?.lastPlayedDate ?? null,
	isPlayed: Boolean(plays?.isPlayed),
	playedPercentage: plays?.playedPercentage ?? null
	// ... rest unchanged ...
});
```

- [ ] **Step 4: Wire up the new fields in series item building**

In the series push block (around line 238-263), add the same two fields:

```typescript
allItems.push({
	// ... existing fields ...
	playCount: Number(plays?.playCount ?? 0),
	lastPlayedDate: plays?.lastPlayedDate ?? null,
	isPlayed: Boolean(plays?.isPlayed),
	playedPercentage: plays?.playedPercentage ?? null
	// ... rest unchanged ...
});
```

- [ ] **Step 5: Run typecheck to verify**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/general/status/media/+page.server.ts
git commit -m "feat: add isPlayed and playedPercentage to media explorer query"
```

---

### Task 2: Redesign the MediaExplorerTable Playback column (desktop + mobile)

**Files:**

- Modify: `src/lib/components/status/MediaExplorerTable.svelte`

- [ ] **Step 1: Add new fields to the local MediaExplorerItem type**

Update the type in the `<script>` block (lines 15-38) to include the new fields:

```typescript
type MediaExplorerItem = {
	id: string;
	tmdbId: number;
	title: string;
	year: number | null;
	mediaType: 'movie' | 'tv';
	mediaSubType: 'standard' | 'anime';
	libraryName: string;
	rootFolderName: string | null;
	monitored: boolean;
	hasFile: boolean;
	fileSize: number;
	resolution: string | null;
	videoCodec: string | null;
	hdrFormat: string | null;
	audioCodec: string | null;
	containerFormat: string | null;
	addedAt: string | null;
	playCount: number;
	lastPlayedDate: string | null;
	isPlayed: boolean;
	playedPercentage: number | null;
	episodeCount: number | null;
	episodeFileCount: number | null;
	posterPath: string | null;
};
```

- [ ] **Step 2: Add Check/CheckCircle import and helper**

Add to the lucide-svelte imports (line 2):

```typescript
import {
	Eye,
	EyeOff,
	HardDrive,
	Film,
	Tv,
	Play,
	Check,
	ArrowUpDown,
	ArrowUp,
	ArrowDown
} from 'lucide-svelte';
```

- [ ] **Step 3: Replace the desktop Plays column header**

Replace the existing Plays sortable header (lines 296-313) with "Playback":

```svelte
<th>
	<button
		class="flex items-center gap-1 text-xs font-medium tracking-wide uppercase {getSortDirection(
			'plays'
		) !== null
			? 'text-primary'
			: 'text-base-content/50 hover:text-base-content'}"
		onclick={() => handleHeaderSort('plays')}
	>
		Playback
		{#if getSortDirection('plays') === 'asc'}
			<ArrowUp class="h-3 w-3" />
		{:else if getSortDirection('plays') === 'desc'}
			<ArrowDown class="h-3 w-3" />
		{:else}
			<ArrowUpDown class="h-3 w-3 opacity-40" />
		{/if}
	</button>
</th>
```

- [ ] **Step 4: Replace the desktop Playback column cell**

Replace the existing Plays cell (lines 422-438) with the new Playback cell:

```svelte
<td>
	<div class="flex flex-col gap-0.5">
		<div class="flex items-center gap-1">
			{#if item.playCount > 0}
				{#if item.isPlayed}
					<Check class="h-3.5 w-3.5 text-success" />
				{:else}
					<Play class="h-3 w-3 text-base-content/50" />
				{/if}
				<span class="text-sm">{item.playCount}</span>
			{:else}
				<span class="text-sm text-base-content/40">-</span>
			{/if}
		</div>
		{#if item.playedPercentage !== null && item.playCount > 0}
			<div class="flex items-center gap-1.5">
				<div class="h-1.5 w-full max-w-16 overflow-hidden rounded-full bg-base-300">
					<div
						class="h-full transition-all duration-500 {item.playedPercentage >= 90
							? 'bg-success'
							: 'bg-primary'}"
						style="width: {Math.round(item.playedPercentage)}%"
					></div>
				</div>
				<span class="text-xs text-base-content/50">{Math.round(item.playedPercentage)}%</span>
			</div>
		{/if}
		{#if lastPlayedRel}
			<span class="text-xs text-base-content/50" title={lastPlayedRel.full}>
				{lastPlayedRel.display}
			</span>
		{/if}
	</div>
</td>
```

- [ ] **Step 5: Update the mobile card view playback section**

Replace the existing play count badge in the mobile card (lines 210-215) with the enhanced version:

```svelte
{#if item.playCount > 0}
	<span class="badge badge-ghost badge-xs">
		{#if item.isPlayed}
			<Check class="h-2.5 w-2.5 text-success" />
		{:else}
			<Play class="h-2.5 w-2.5" />
		{/if}
		{item.playCount}
	</span>
{/if}
```

And add a progress bar below the existing status row in the mobile card, after the episode progress section (before the closing `</div>` of the info section, around line 241). Insert before the closing `</div>` of the `min-w-0 flex-1` div:

```svelte
{#if item.playedPercentage !== null && item.playCount > 0}
	<div class="mt-1.5">
		<div class="flex items-center gap-1.5 text-xs text-base-content/60">
			<div class="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-base-300">
				<div
					class="h-full transition-all duration-500 {item.playedPercentage >= 90
						? 'bg-success'
						: 'bg-primary'}"
					style="width: {Math.round(item.playedPercentage)}%"
				></div>
			</div>
			<span>{Math.round(item.playedPercentage)}%</span>
		</div>
	</div>
{/if}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/status/MediaExplorerTable.svelte
git commit -m "feat: redesign playback column with isPlayed and playedPercentage indicators"
```

---

### Task 3: Redesign the Media Explorer filter bar with tiered layout

**Files:**

- Modify: `src/routes/settings/general/status/media/+page.svelte`

This is the largest change. The existing filter section (lines 89-315) gets replaced with a compact two-tier system.

- [ ] **Step 1: Add new imports and state**

Replace the existing imports (line 4) and add expandable state after line 13:

```typescript
import { Search, HardDrive, Film, Tv, X, SlidersHorizontal, ChevronDown } from 'lucide-svelte';
```

Add after `let searchQuery = $state('');` (line 13):

```typescript
let qualityExpanded = $state(
	Object.entries(data.filters).some(
		([key, value]) =>
			!['sort', 'type', 'monitored', 'hasPlays', 'library'].includes(key) && value !== 'all'
	)
);
```

- [ ] **Step 2: Replace the entire filter dropdown section**

Replace the entire block from `<!-- Filter dropdowns row -->` (line 89) through line 315 (the closing `</div>` of the filter row) with the new tiered layout:

```svelte
<!-- Filter bar -->
<div class="space-y-2">
    <!-- Tier 1: Primary filter chips -->
    <div class="flex flex-wrap items-center gap-2">
        <!-- Type filter as chip group -->
        <div class="join">
            <button
                class="btn join-item btn-sm {data.filters.type === 'all'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('type', 'all')}
            >
                All
            </button>
            <button
                class="btn join-item btn-sm {data.filters.type === 'movie'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('type', 'movie')}
            >
                <Film class="h-3.5 w-3.5" />
                Movies
            </button>
            <button
                class="btn join-item btn-sm {data.filters.type === 'tv'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('type', 'tv')}
            >
                <Tv class="h-3.5 w-3.5" />
                TV
            </button>
        </div>

        <!-- Status filter as chip group -->
        <div class="join">
            <button
                class="btn join-item btn-sm {data.filters.monitored === 'all'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('monitored', 'all')}
            >
                All Status
            </button>
            <button
                class="btn join-item btn-sm {data.filters.monitored === 'monitored'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('monitored', 'monitored')}
            >
                Monitored
            </button>
            <button
                class="btn join-item btn-sm {data.filters.monitored === 'unmonitored'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('monitored', 'unmonitored')}
            >
                Unmonitored
            </button>
        </div>

        <!-- Plays filter as chip group -->
        <div class="join">
            <button
                class="btn join-item btn-sm {data.filters.hasPlays === 'all'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('hasPlays', 'all')}
            >
                All Plays
            </button>
            <button
                class="btn join-item btn-sm {data.filters.hasPlays === 'played'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('hasPlays', 'played')}
            >
                Played
            </button>
            <button
                class="btn join-item btn-sm {data.filters.hasPlays === 'neverPlayed'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => updateUrlParam('hasPlays', 'neverPlayed')}
            >
                Never Played
            </button>
        </div>

        {#if (data.libraries?.length ?? 0) > 1}
            <select
                class="select-bordered select select-sm w-auto"
                value={data.filters.library}
                onchange={(e) => updateUrlParam('library', (e.target as HTMLSelectElement).value)}
            >
                <option value="all">All Libraries</option>
                {#each data.libraries ?? [] as lib}
                    <option value={lib.id}>{lib.name}</option>
                {/each}
            </select>
        {/if}

        <!-- Quality toggle button -->
        {@const qualityActiveCount = [
            data.filters.classification,
            data.filters.resolution,
            data.filters.videoCodec,
            data.filters.hdrFormat,
            data.filters.audioCodec,
            data.filters.container,
            data.filters.rootFolder
        ].filter((v) => v !== 'all').length}
        <button
            class="btn btn-sm {qualityExpanded ? 'btn-active' : 'btn-ghost'} gap-1"
            onclick={() => (qualityExpanded = !qualityExpanded)}
        >
            <SlidersHorizontal class="h-4 w-4" />
            Quality &amp; Technical
            {#if qualityActiveCount > 0}
                <span class="badge badge-primary badge-xs">{qualityActiveCount}</span>
            {/if}
            <ChevronDown
                class="h-3.5 w-3.5 transition-transform {qualityExpanded ? 'rotate-180' : ''}"
            />
        </button>
    </div>

    <!-- Tier 2: Quality & Technical filters (expandable) -->
    {#if qualityExpanded}
        <div class="flex flex-wrap items-center gap-2 rounded-lg bg-base-200/50 p-2">
            <select
                class="select-bordered select select-sm w-auto"
                value={data.filters.classification}
                onchange={(e) =>
                    updateUrlParam('classification', (e.target as HTMLSelectElement).value)}
            >
                <option value="all">All Classes</option>
                <option value="standard">Standard</option>
                <option value="anime">Anime</option>
            </select>

            {#if data.filterOptions.resolutions.length > 0}
                <select
                    class="select-bordered select select-sm w-auto"
                    value={data.filters.resolution}
                    onchange={(e) =>
                        updateUrlParam('resolution', (e.target as HTMLSelectElement).value)}
                >
                    <option value="all">All Resolutions</option>
                    {#each data.filterOptions.resolutions as opt}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            {/if}

            {#if data.filterOptions.videoCodecs.length > 0}
                <select
                    class="select-bordered select select-sm w-auto"
                    value={data.filters.videoCodec}
                    onchange={(e) =>
                        updateUrlParam('videoCodec', (e.target as HTMLSelectElement).value)}
                >
                    <option value="all">All Codecs</option>
                    {#each data.filterOptions.videoCodecs as opt}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            {/if}

            {#if data.filterOptions.hdrFormats.length > 0}
                <select
                    class="select-bordered select select-sm w-auto"
                    value={data.filters.hdrFormat}
                    onchange={(e) =>
                        updateUrlParam('hdrFormat', (e.target as HTMLSelectElement).value)}
                >
                    <option value="all">All HDR</option>
                    {#each data.filterOptions.hdrFormats as opt}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            {/if}

            {#if data.filterOptions.audioCodecs.length > 0}
                <select
                    class="select-bordered select select-sm w-auto"
                    value={data.filters.audioCodec}
                    onchange={(e) =>
                        updateUrlParam('audioCodec', (e.target as HTMLSelectElement).value)}
                >
                    <option value="all">All Audio</option>
                    {#each data.filterOptions.audioCodecs as opt}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            {/if}

            {#if data.filterOptions.containers.length > 0}
                <select
                    class="select-bordered select select-sm w-auto"
                    value={data.filters.container}
                    onchange={(e) =>
                        updateUrlParam('container', (e.target as HTMLSelectElement).value)}
                >
                    <option value="all">All Containers</option>
                    {#each data.filterOptions.containers as opt}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            {/if}

            {#if (data.rootFolders?.length ?? 0) > 1}
                <select
                    class="select-bordered select select-sm w-auto"
                    value={data.filters.rootFolder}
                    onchange={(e) =>
                        updateUrlParam('rootFolder', (e.target as HTMLSelectElement).value)}
                >
                    <option value="all">All Folders</option>
                    {#each data.rootFolders ?? [] as rf}
                        <option value={rf.id}>{rf.name || rf.path}</option>
                    {/each}
                </select>
            {/if}
        </div>
    {/if}
</div>
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/general/status/media/+page.svelte
git commit -m "feat: redesign media explorer filter bar with tiered chip layout"
```

---

### Task 4: Format and final verification

- [ ] **Step 1: Run formatter**

Run: `npm run format`

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Final commit if formatting changed anything**

```bash
git add -A
git commit -m "style: format media explorer changes"
```
