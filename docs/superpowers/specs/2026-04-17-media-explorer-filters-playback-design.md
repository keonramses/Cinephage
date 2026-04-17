# Media Explorer Filter Bar Redesign + Playback Column

## Problem

The Media Explorer page (`/settings/general/status/media`) has 11 filter dropdowns spread across a `flex-wrap` row. Each dropdown has its own uppercase label + full-width `<select>` element. On typical viewports they wrap to 2-3 rows, consuming significant vertical space and making the page feel cluttered.

Playback data from media servers (Jellyfin/Emby/Plex) is collected but not fully surfaced: `isPlayed` and `playedPercentage` exist in the `mediaServerSyncedItems` table but are not shown in any UI component.

## Scope

- **In scope:** Media Explorer page filter bar layout, Playback column in MediaExplorerTable
- **Out of scope:** Status page (`/settings/general/status`) layout, Libraries page, dashboard, MediaServerStatsSection

## Design

### Filter Bar — Tiered Layout

Replace the single `flex-wrap` row of 11 labeled `<select>` dropdowns with a two-tier system.

#### Tier 1: Primary Filter Chips (always visible)

A compact horizontal strip containing:

- **Type** chip group (join): "All" / "Movies" / "TV" — button-group style using DaisyUI `join`
- **Status** chip group (join): "All Status" / "Monitored" / "Unmonitored"
- **Plays** chip group (join): "All Plays" / "Played" / "Never Played"
- **Library** select (compact, only if >1 library exists)
- **"Quality & Technical" toggle button**: Shows badge with count of active quality filters. Expands/collapses Tier 2.

Active groups use `btn-primary`, inactive use `btn-ghost`. This replaces the 5 primary `<select>` dropdowns and the Library dropdown with compact chip groups.

#### Tier 2: Quality & Technical Filters (expandable)

Collapsed by default. Shown when the "Quality & Technical" toggle is clicked.

Contains a compact row of `<select>` elements inside a `bg-base-200/50` container:

- Class (Standard/Anime)
- Resolution (dynamic)
- Codec (dynamic)
- HDR (dynamic)
- Audio (dynamic)
- Container (dynamic)
- Folder (only if >1 root folder exists)

**Behavior:**

- Auto-expands if any quality filter has a non-"all" value on page load
- Conditional rendering: selects hidden if their data set is empty

### Playback Column

Replace the existing "Plays" column with a "Playback" column.

#### Data fields added

- `isPlayed: boolean` — `MAX(isPlayed)` from mediaServerSyncedItems
- `playedPercentage: number | null` — `MAX(playedPercentage)` from mediaServerSyncedItems

#### Desktop table cell layout

- isPlayed checkmark icon (green `Check` from lucide) when true, `Play` icon when false but playCount > 0
- playCount number next to indicator
- Thin progress bar with percentage text for playedPercentage (hidden when null)
- Relative lastPlayedDate below (unchanged)

#### Mobile card layout

- Watched checkmark icon next to play count badge
- Mini progress bar for playedPercentage beneath status row

### Server-side Changes

**File:** `src/routes/settings/general/status/media/+page.server.ts`

Extend the `playStatsRows` query to aggregate `MAX(isPlayed)` and `MAX(playedPercentage)` alongside existing `SUM(playCount)` and `MAX(lastPlayedDate)`.

### Files Modified

| File                                                       | Change                                           |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `src/routes/settings/general/status/media/+page.server.ts` | Add isPlayed/playedPercentage to query + type    |
| `src/routes/settings/general/status/media/+page.svelte`    | Tiered chip + expandable filter layout           |
| `src/lib/components/status/MediaExplorerTable.svelte`      | Playback column with isPlayed + playedPercentage |
