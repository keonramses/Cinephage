# Collections Integration into Movies Page - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move collection functionality from a separate Collections page into the Movies page as a filter, sort option, and grouped view mode, then delete the old Collections page.

**Architecture:** Add collection data to the existing Movies server load function, extend the filter/sort infrastructure already in place, add a "grouped" view mode to the view preferences store, and render collection sections in the Movies page.

**Tech Stack:** SvelteKit, Svelte 5, Drizzle ORM, Paraglide JS (i18n), Tailwind/DaisyUI

---

## File Structure

| File                                                  | Action | Responsibility                                                                |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `src/lib/types/library.ts`                            | Modify | Add `collectionName` and `tmdbCollectionId` to `LibraryMovie` type            |
| `src/lib/stores/view-preferences.svelte.ts`           | Modify | Add "grouped" to `ViewMode` type                                              |
| `src/routes/library/movies/+page.server.ts`           | Modify | Add collection filter, collection sort, extract unique collection names       |
| `src/routes/library/movies/+page.svelte`              | Modify | Add collection filter/sort options, grouped view rendering, collection badges |
| `src/lib/components/library/LibraryMediaCard.svelte`  | Modify | Add optional collection badge prop                                            |
| `src/lib/components/library/LibraryMediaTable.svelte` | Modify | Add optional collection badge on title column                                 |
| `src/routes/+layout.svelte`                           | Modify | Remove Collections sidebar nav item                                           |
| `messages/en.json`                                    | Modify | Add i18n keys for collection filter/sort/grouped                              |
| `messages/es.json`                                    | Modify | Add Spanish translations                                                      |
| `messages/de.json`                                    | Modify | Add German translations                                                       |
| `src/routes/library/collections/*`                    | Delete | Remove all collections page files                                             |
| `src/routes/api/library/collections/*`                | Delete | Remove all collections API files                                              |

---

### Task 1: Add collection fields to LibraryMovie type

**Files:**

- Modify: `src/lib/types/library.ts:71-97`

- [ ] **Step 1: Add `collectionName` and `tmdbCollectionId` fields to `LibraryMovie` interface**

Add these two fields after the `hasFile` field:

```typescript
tmdbCollectionId?: number | null;
collectionName?: string | null;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx svelte-check --threshold error 2>&1 | tail -5`

Expected: No new type errors introduced (these are optional fields)

---

### Task 2: Add "grouped" view mode to view preferences

**Files:**

- Modify: `src/lib/stores/view-preferences.svelte.ts`

- [ ] **Step 1: Update ViewMode type and logic**

Change `ViewMode` from `'grid' | 'list'` to `'grid' | 'list' | 'grouped'`. Update `getInitialViewMode` to accept `'grouped'`. Update `toggleViewMode` to cycle: grid -> list -> grouped -> grid.

```typescript
export type ViewMode = 'grid' | 'list' | 'grouped';

function getInitialViewMode(): ViewMode {
	if (browser) {
		const stored = sessionStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
		if (stored === 'grid' || stored === 'list' || stored === 'grouped') {
			return stored;
		}
	}
	return 'grid';
}
```

Update `toggleViewMode`:

```typescript
toggleViewMode() {
	const modes: ViewMode[] = ['grid', 'list', 'grouped'];
	const nextIndex = (modes.indexOf(this.viewMode) + 1) % modes.length;
	this.setViewMode(modes[nextIndex]);
}
```

---

### Task 3: Add i18n keys for collection features

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/es.json`
- Modify: `messages/de.json`

- [ ] **Step 1: Add English keys**

Add after the existing `library_movies_sort*` entries:

```json
"library_movies_sortCollectionAsc": "Collection (A-Z)",
"library_movies_sortCollectionDesc": "Collection (Z-A)",
"library_movies_filterCollection": "Collection",
"library_movies_filterNoCollection": "No Collection",
"library_movies_viewGrouped": "Grouped",
"library_movies_other": "Other",
"library_movies_collectionStats": "{count} movies, {fileCount} with files, {monitoredCount} monitored"
```

- [ ] **Step 2: Add Spanish translations**

```json
"library_movies_sortCollectionAsc": "Colección (A-Z)",
"library_movies_sortCollectionDesc": "Colección (Z-A)",
"library_movies_filterCollection": "Colección",
"library_movies_filterNoCollection": "Sin colección",
"library_movies_viewGrouped": "Agrupado",
"library_movies_other": "Otros",
"library_movies_collectionStats": "{count} películas, {fileCount} con archivos, {monitoredCount} monitoreadas"
```

- [ ] **Step 3: Add German translations**

```json
"library_movies_sortCollectionAsc": "Sammlung (A-Z)",
"library_movies_sortCollectionDesc": "Sammlung (Z-A)",
"library_movies_filterCollection": "Sammlung",
"library_movies_filterNoCollection": "Keine Sammlung",
"library_movies_viewGrouped": "Gruppiert",
"library_movies_other": "Sonstige",
"library_movies_collectionStats": "{count} Filme, {fileCount} mit Dateien, {monitoredCount} überwacht"
```

- [ ] **Step 4: Rebuild paraglide**

Run: `npm run build 2>&1 | tail -5`

---

### Task 4: Extend movies server load with collection data

**Files:**

- Modify: `src/routes/library/movies/+page.server.ts`

- [ ] **Step 1: Add `collection` URL param parsing**

After line 45 (`const hdrFormat = ...`), add:

```typescript
const collection = url.searchParams.get('collection') || 'all';
```

- [ ] **Step 2: Include collection fields in the DB query**

In the `allMovies` query select (around line 62-90), add after `hasFile: movies.hasFile`:

```typescript
tmdbCollectionId: movies.tmdbCollectionId,
collectionName: movies.collectionName,
```

- [ ] **Step 3: Extract unique collection names for filter dropdown**

After the existing unique attribute extraction block (after line 207), add:

```typescript
const uniqueCollections = new Set<string>();
for (const movie of moviesWithFiles) {
	if (movie.collectionName) {
		uniqueCollections.add(movie.collectionName);
	}
}
const sortedCollections = [...uniqueCollections].sort();
```

- [ ] **Step 4: Add collection filter logic**

After the HDR format filter block (after line 280), add:

```typescript
if (collection === 'none') {
	filteredMovies = filteredMovies.filter((m) => !m.collectionName);
} else if (collection !== 'all') {
	filteredMovies = filteredMovies.filter((m) => m.collectionName === collection);
}
```

- [ ] **Step 5: Add collection sort case**

In the sort switch statement (around line 287-304), add a new case after `case 'size':`:

```typescript
case 'collection':
	comparison =
		(a.collectionName ?? '\u{10FFFF}') === (b.collectionName ?? '\u{10FFFF}')
			? (a.title || '').localeCompare(b.title || '')
			: (a.collectionName ?? '\u{10FFFF}').localeCompare(b.collectionName ?? '\u{10FFFF}');
	break;
```

- [ ] **Step 6: Add collection data to return object**

In the return object (around line 317-350):

Add `collection` to the `filters` object:

```typescript
filters: {
	sort,
	library: selectedLibrary?.slug ?? '',
	monitored,
	fileStatus,
	qualityProfile: effectiveQualityProfileFilter,
	resolution,
	videoCodec,
	hdrFormat,
	collection
},
```

Add `uniqueCollections` to the return:

```typescript
uniqueCollections: sortedCollections,
```

Add to the error fallback return as well:

```typescript
collection: 'all',
```

and:

```typescript
uniqueCollections: [] as string[],
```

---

### Task 5: Add collection filter, sort, and grouped view to Movies page

**Files:**

- Modify: `src/routes/library/movies/+page.svelte`

- [ ] **Step 1: Add collection sort options**

In the `sortOptions` array (around line 392-401), add after the `size-asc` entry:

```typescript
{ value: 'collection-asc', label: m.library_movies_sortCollectionAsc() },
{ value: 'collection-desc', label: m.library_movies_sortCollectionDesc() }
```

- [ ] **Step 2: Add collection filter option**

In the `filterOptions` derived (around line 410-489), add after the `hdrFormat` conditional block:

```typescript
...(data.uniqueCollections.length > 0
	? [
			{
				key: 'collection',
				label: m.library_movies_filterCollection(),
				options: [
					{ value: 'all', label: m.library_movies_filterAll() },
					{ value: 'none', label: m.library_movies_filterNoCollection() },
					...data.uniqueCollections.map((c: string) => ({ value: c, label: c }))
				]
			}
		]
	: [])
```

- [ ] **Step 3: Add collection to currentFilters**

In the `currentFilters` derived (around line 515-523), add:

```typescript
collection: data.filters.collection,
```

- [ ] **Step 4: Update view toggle to support 3 modes**

Replace the view toggle button (around lines 662-676) with a 3-way toggle:

```svelte
<button
	class="btn btn-ghost btn-xs sm:btn-sm"
	onclick={() => viewPreferences.toggleViewMode()}
	aria-label="Switch view"
>
	{#if viewPreferences.viewMode === 'grid'}
		<List class="h-4 w-4" />
		<span class="hidden sm:inline">{m.library_movies_list()}</span>
	{:else if viewPreferences.viewMode === 'list'}
		<Layers class="h-4 w-4" />
		<span class="hidden sm:inline">{m.library_movies_viewGrouped()}</span>
	{:else}
		<LayoutGrid class="h-4 w-4" />
		<span class="hidden sm:inline">{m.library_movies_grid()}</span>
	{/if}
</button>
```

Add `Layers` to the lucide imports at the top.

- [ ] **Step 5: Add grouped view rendering**

In the main content area (around line 768-808), add a new `{:else if}` branch for the grouped view. After the `{:else}` (list view) block closes, before the `{/if}`:

```svelte
{:else if viewPreferences.viewMode === 'grouped'}
	{@const collectionGroups = groupByCollection(filteredMovies)}
	{#each collectionGroups as group (group.name ?? '__none__')}
		<div class="mb-8">
			<button
				class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-base-200/60"
				onclick={() => toggleCollectionGroup(group.name ?? '__none__')}
			>
				<svg
					class="h-4 w-4 shrink-0 transition-transform {collapsedGroups.has(group.name ?? '__none__') ? '' : 'rotate-90'}"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
				</svg>
				<h3 class="text-lg font-semibold">
					{group.name ?? m.library_movies_other()}
				</h3>
				<span class="badge badge-ghost badge-sm">
					{group.movies.length} {group.movies.length === 1 ? 'movie' : 'movies'}
				</span>
				<span class="text-xs text-base-content/50">
					{group.movies.filter((mv) => mv.hasFile).length}/{group.movies.length} files,
					{group.movies.filter((mv) => mv.monitored).length}/{group.movies.length} monitored
				</span>
			</button>
			{#if !collapsedGroups.has(group.name ?? '__none__')}
				<div class="grid grid-cols-3 gap-3 pt-2 sm:gap-4 lg:grid-cols-9">
					{#each group.movies as movie (movie.id)}
						<LibraryMediaCard
							item={movie}
							selectable={showCheckboxes}
							selected={selectedMovies.has(movie.id)}
							onSelectChange={handleItemSelectChange}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
```

- [ ] **Step 6: Add grouped view helper functions and state**

In the `<script>` section, add after the `searchQuery` state:

```typescript
let collapsedGroups = new SvelteSet<string>();
```

Add helper functions:

```typescript
function groupByCollection(movies: typeof data.movies) {
	const groups = new Map<string, typeof data.movies>();
	for (const movie of movies) {
		const key = movie.collectionName ?? '__none__';
		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)!.push(movie);
	}
	const result: { name: string | null; movies: typeof data.movies }[] = [];
	for (const [key, groupMovies] of groups) {
		result.push({
			name: key === '__none__' ? null : key,
			movies: groupMovies
		});
	}
	result.sort((a, b) => {
		if (!a.name) return 1;
		if (!b.name) return -1;
		return a.name.localeCompare(b.name);
	});
	return result;
}

function toggleCollectionGroup(key: string) {
	if (collapsedGroups.has(key)) {
		collapsedGroups.delete(key);
	} else {
		collapsedGroups.add(key);
	}
}
```

---

### Task 6: Add collection badge to LibraryMediaCard

**Files:**

- Modify: `src/lib/components/library/LibraryMediaCard.svelte`

- [ ] **Step 1: Add `collectionName` prop**

Add to the Props interface:

```typescript
collectionName?: string;
```

Update the destructured props to include it:

```typescript
let {
	item,
	selectable = false,
	selected = false,
	onSelectChange,
	collectionName
}: Props = $props();
```

- [ ] **Step 2: Add collection badge to hover overlay**

In the hover overlay section (around line 186-205), after the year display and before the series progress check, add:

```svelte
{#if collectionName}
	<span
		class="mt-1 inline-block max-w-full truncate rounded bg-white/20 px-1.5 py-0.5 text-xs text-white/80"
	>
		{collectionName}
	</span>
{/if}
```

---

### Task 7: Add collection badge to LibraryMediaTable

**Files:**

- Modify: `src/lib/components/library/LibraryMediaTable.svelte`

- [ ] **Step 1: Add `collectionName` display**

In the title cell (around line 579-586), after the link, add a collection badge:

Find the title `<td>` and update it to:

```svelte
<td>
	<a
		href={resolvePath(`/library/${mediaType}/${item.id}`)}
		class="block max-w-xs truncate text-base font-medium hover:text-primary"
	>
		{item.title}
	</a>
	{#if 'collectionName' in item && item.collectionName}
		<span class="mt-0.5 badge badge-outline badge-xs">{item.collectionName}</span>
	{/if}
</td>
```

Also add collection badge in the mobile card view, after the title span (around line 348-350):

```svelte
{#if 'collectionName' in item && item.collectionName}
	<span class="mt-1 badge badge-outline badge-xs">{item.collectionName}</span>
{/if}
```

---

### Task 8: Pass collectionName to card/table components in Movies page

**Files:**

- Modify: `src/routes/library/movies/+page.svelte`

- [ ] **Step 1: Pass collectionName to LibraryMediaCard**

In the grid view (around line 777-783), update the card:

```svelte
<LibraryMediaCard
	item={movie}
	selectable={showCheckboxes}
	selected={selectedMovies.has(movie.id)}
	onSelectChange={handleItemSelectChange}
	collectionName={movie.collectionName ?? undefined}
/>
```

The table already gets the full item object, so `collectionName` is already available via the item.

---

### Task 9: Remove Collections sidebar nav item

**Files:**

- Modify: `src/routes/+layout.svelte:195-200`

- [ ] **Step 1: Remove the Collections menu child**

Delete these lines:

```typescript
{
	href: '/library/collections',
	label: () => 'Collections',
	icon: Layers,
	match: (url: URL) => url.pathname.startsWith('/library/collections')
},
```

- [ ] **Step 2: Remove unused `Layers` import if no longer needed**

Check if `Layers` is used elsewhere in the file. If not, remove from the import.

---

### Task 10: Delete Collections page and API files

**Files:**

- Delete: `src/routes/library/collections/+page.svelte`
- Delete: `src/routes/library/collections/+page.server.ts`
- Delete: `src/routes/library/collections/[id]/+page.svelte`
- Delete: `src/routes/library/collections/[id]/+page.server.ts`
- Delete: `src/routes/api/library/collections/+server.ts`
- Delete: `src/routes/api/library/collections/[id]/+server.ts`

- [ ] **Step 1: Delete all collection files**

```bash
rm -rf src/routes/library/collections/
rm -rf src/routes/api/library/collections/
```

- [ ] **Step 2: Verify no broken imports**

Run: `npm run check 2>&1 | tail -10`

---

### Task 11: Final verification

- [ ] **Step 1: Run typecheck**

Run: `npm run check 2>&1 | tail -10`
Expected: No type errors

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1 | tail -10`
Expected: No lint errors

- [ ] **Step 3: Run tests**

Run: `npm run test 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds
