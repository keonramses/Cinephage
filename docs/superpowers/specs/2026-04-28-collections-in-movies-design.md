# Collections Integration into Movies Page

## Problem

The separate `/library/collections` page is redundant. It provides a basic table of TMDB collections and a detail poster grid, but the same functionality can be delivered more naturally as filters and view modes on the existing Movies page.

## Design

### 1. Collection Filter

- **URL param:** `?collection=<collectionName>` or `?collection=none`
- **Options:** Dynamically populated from unique `collectionName` values in the DB, plus "None" and "All" (default)
- **Server-side filtering:** Applied in `+page.server.ts` alongside existing filters
- No extra DB query needed -- `tmdbCollectionId` and `collectionName` are already on the `movies` table and included in the existing query

### 2. Collection Sort

- Add `collection-asc` / `collection-desc` sort options
- Primary sort by `collectionName` (nulls last), secondary sort by `title` within each collection

### 3. Group-by-Collection View

- Third view mode option alongside grid/list (grid / list / grouped)
- Movies partitioned by `collectionName` into collapsible sections
- Each section header shows: collection name, movie count, has-file count, monitored count
- Movies not in any collection appear in a final "Other" section
- Existing filters and search still apply within each section
- State stored in existing `view-preferences` store

### 4. Collection Badges

- Grid view: small badge below title or overlaid on poster
- Table view: inline badge next to title
- Only shown when movie has a `collectionName`

### 5. Remove Separate Collections Page

Delete:

- `src/routes/library/collections/+page.svelte` and `+page.server.ts`
- `src/routes/library/collections/[id]/+page.svelte` and `+page.server.ts`
- `src/routes/api/library/collections/+server.ts` and `[id]/+server.ts`
- Remove Collections nav item from `src/routes/+layout.svelte`

## Files to Modify

| File                                                  | Change                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/routes/library/movies/+page.server.ts`           | Add collection filter, collection sort, extract unique collection names     |
| `src/routes/library/movies/+page.svelte`              | Add collection filter/sort options, group view rendering, collection badges |
| `src/lib/components/library/LibraryMediaCard.svelte`  | Add optional collection badge                                               |
| `src/lib/components/library/LibraryMediaTable.svelte` | Add optional collection column/badge                                        |
| `src/lib/stores/view-preferences.svelte.ts`           | Add "grouped" view option                                                   |
| `src/routes/+layout.svelte`                           | Remove Collections nav item                                                 |

## Notes

- Collections only apply to movies. No changes to TV Shows page.
- No DB schema changes needed.
- `LibraryControls` is already generic -- no modification needed.
