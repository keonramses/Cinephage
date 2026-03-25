# i18n Migration Tracker

## Project Overview

**Goal**: Complete internationalization (i18n) overhaul of Cinephage - replace ALL hardcoded English strings across ~217 Svelte components with Paraglide JS v2 message function calls.

**Approach**: Phased migration — routes first, then components, then utilities. English-only initially, designed for multi-language expansion later.

## i18n Framework

- **Library**: Paraglide JS v2 (`@inlang/paraglide-js`)
- **Configuration**: `project.inlang/settings.json` (languageTags: `["en"]`)
- **Source messages**: `messages/en.json` (single file, flat underscore-separated keys)
- **Compiled output**: `src/lib/paraglide/` (auto-generated, do not edit)
- **Usage**: `import * as m from '$lib/paraglide/messages.js';` then `m.keyName()`

## Migration Rules

1. **Key naming**: `namespace_subnamespace_descriptiveKey` (camelCase segments, underscore-separated)
   - Example: `dashboard_stats_movies`, `toast_activity_pausedDownloads`
2. **Parameterized strings**: Use `{paramName}` in message values, pass object to function
   - Key: `"Paused {count} downloads"` → Usage: `m.toast_activity_pausedDownloads({ count: 5 })`
3. **NO ICU plural syntax**: Paraglide v2 doesn't support `{count, plural, one {...} other {...}}`
   - Use simple parameterized strings: `"{count} downloads"` (works for all counts in English)
4. **Reuse existing keys** where exact string match exists
5. **Do NOT internationalize**:
   - Server-side API error messages
   - Technical identifiers (CSS classes, HTTP headers, etc.)
   - Byte unit abbreviations (B, KB, MB, GB, TB, PB)
   - Keyboard key names (Enter, Escape, etc.)
   - Dynamic data from external APIs (TMDB, etc.)

## Current Status

### ✅ COMPLETED

#### Infrastructure

- [x] Fixed invalid ICU plural syntax in `messages/en.json` (13 keys)
- [x] Paraglide compiles successfully
- [x] Type check passes with 0 errors, 0 warnings
- [x] `vite.config.ts` configured with `paraglideVitePlugin`
- [x] `project.inlang/settings.json` set to English only (`["en"]`)

#### Route Files (44 files)

- [x] `+layout.svelte` — migrated
- [x] `+error.svelte` — migrated
- [x] `+page.svelte` (dashboard) — migrated
- [x] `login/+page.svelte` — migrated
- [x] `setup/+page.svelte` — migrated
- [x] `profile/+page.svelte` — migrated
- [x] `discover/+page.svelte` — migrated
- [x] `discover/movie/[id]/+page.svelte` — migrated
- [x] `discover/person/[id]/+page.svelte` — migrated
- [x] `discover/tv/[id]/+page.svelte` — migrated
- [x] `activity/+page.svelte` — migrated
- [x] `smartlists/+page.svelte` — migrated
- [x] `smartlists/[id]/+page.svelte` — migrated
- [x] `smartlists/[id]/edit/+page.svelte` — migrated
- [x] `smartlists/new/+page.svelte` — migrated
- [x] `livetv/channels/+page.svelte` — migrated
- [x] `livetv/epg/+page.svelte` — migrated
- [x] `livetv/accounts/+page.svelte` — migrated
- [x] `library/movies/+page.svelte` — migrated
- [x] `library/tv/+page.svelte` — migrated
- [x] `library/movie/[id]/+page.svelte` — migrated
- [x] `library/tv/[id]/+page.svelte` — migrated
- [x] `library/unmatched/+page.svelte` — migrated
- [x] `library/import/+page.svelte` — migrated (2942 lines!)
- [x] `settings/general/+page.svelte` — migrated
- [x] `settings/system/+page.svelte` — migrated
- [x] `settings/logs/+page.svelte` — migrated
- [x] `settings/tasks/+page.svelte` — migrated
- [x] `settings/filters/+page.svelte` — migrated
- [x] `settings/quality/+page.svelte` — migrated
- [x] `settings/streaming/+page.svelte` — migrated
- [x] `settings/profiles/+page.svelte` — migrated
- [x] `settings/naming/+page.svelte` — migrated
- [x] `settings/naming/rename/+page.svelte` — migrated
- [x] `settings/integrations/+layout.svelte` — migrated
- [x] `settings/integrations/+page.svelte` — migrated
- [x] `settings/integrations/captcha/+page.svelte` — migrated
- [x] `settings/integrations/download-clients/+page.svelte` — migrated
- [x] `settings/integrations/indexers/+page.svelte` — migrated
- [x] `settings/integrations/language-profiles/+page.svelte` — migrated
- [x] `settings/integrations/media-browsers/+page.svelte` — migrated
- [x] `settings/integrations/nntp-servers/+page.svelte` — migrated
- [x] `settings/integrations/subtitle-providers/+page.svelte` — migrated

#### Component Files (173 files)

**Migrated (37 files):**

- [x] `ui/LanguageSelector.svelte`
- [x] `ui/AsyncState.svelte`
- [x] `ui/MediaTypeBadge.svelte`
- [x] `ui/OperationProgress.svelte`
- [x] `ui/ThemeSelector.svelte`
- [x] `ui/TmdbConfigRequired.svelte`
- [x] `ui/Toasts.svelte`
- [x] `ui/modal/ConfirmationModal.svelte`
- [x] `ui/modal/DeleteConfirmationModal.svelte`
- [x] `ui/modal/ModalFooter.svelte`
- [x] `ui/modal/ModalHeader.svelte`
- [x] `ui/modal/ModalWrapper.svelte`
- [x] `ui/modal/TestResult.svelte`
- [x] `activity/ActiveFilters.svelte`
- [x] `activity/ActivityDetailModal.svelte`
- [x] `activity/ActivityFilters.svelte`
- [x] `activity/ActivityTable.svelte`
- [x] `activity/QueueStatsCards.svelte`
- [x] `activity/activity-display-utils.ts`
- [x] `library/AddToLibraryModal.svelte`
- [x] `library/AutoSearchStatus.svelte`
- [x] `library/MonitorToggle.svelte`
- [x] `library/ScoreBadge.svelte`
- [x] `library/StatusIndicator.svelte`
- [x] `tmdb/CrewList.svelte`
- [x] `tmdb/FilmographyCard.svelte`
- [x] `tmdb/MediaCard.svelte`
- [x] `tmdb/MediaHero.svelte`
- [x] `tmdb/ProductionCompanies.svelte`
- [x] `tmdb/SeasonList.svelte`
- [x] `tmdb/TmdbImage.svelte`
- [x] `tmdb/WatchProviders.svelte`
- [x] `ui/Toasts.svelte`
- [x] `ui/modal/ConfirmationModal.svelte`
- [x] `ui/modal/DeleteConfirmationModal.svelte`
- [x] `ui/modal/ModalFooter.svelte`
- [x] `ui/modal/ModalHeader.svelte`
- [x] `ui/modal/ModalWrapper.svelte`
- [x] `ui/modal/TestResult.svelte`
- [x] `activity/ActiveFilters.svelte`
- [x] `activity/ActivityDetailModal.svelte`
- [x] `activity/ActivityFilters.svelte`
- [x] `activity/ActivityTable.svelte`
- [x] `activity/QueueStatsCards.svelte`
- [x] `activity/activity-display-utils.ts`
- [x] `library/AddToLibraryModal.svelte`
- [x] `library/AutoSearchStatus.svelte`
- [x] `library/MonitorToggle.svelte`
- [x] `library/ScoreBadge.svelte`
- [x] `library/StatusIndicator.svelte`
- [x] `tmdb/CrewList.svelte`
- [x] `tmdb/FilmographyCard.svelte`
- [x] `tmdb/MediaCard.svelte`
- [x] `tmdb/MediaHero.svelte`
- [x] `tmdb/ProductionCompanies.svelte`
- [x] `tmdb/SeasonList.svelte`
- [x] `tmdb/TmdbImage.svelte`
- [x] `tmdb/WatchProviders.svelte`

**Still to migrate (142 files):**

##### activity (0 files remaining)

- All activity components migrated ✅

##### discover (4 files)

- `components/discover/` — none migrated yet
  - Likely files: DiscoverGrid.svelte, DiscoverCard.svelte, etc.

##### downloadClients (6 files)

- `components/downloadClients/` — none migrated

##### formats (3 files)

- `components/formats/` — none migrated

##### indexers (11 files)

- `components/indexers/` — none migrated

##### library (27 files remaining)

- `components/library/` — 6 migrated, ~27 still needed
  - Files like: LibraryMediaCard.svelte, LibraryMediaGrid.svelte, SeasonCard.svelte, EpisodeCard.svelte, etc.

##### livetv (25 files)

- `components/livetv/` — none migrated

##### mediaBrowsers (3 files)

- `components/mediaBrowsers/` — none migrated

##### naming (2 files)

- `components/naming/` — none migrated

##### nntpServers (3 files)

- `components/nntpServers/` — none migrated

##### profiles (4 files)

- `components/profiles/` — none migrated

##### rootFolders (2 files)

- `components/rootFolders/` — none migrated

##### search (2 files)

- `components/search/` — none migrated

##### smartlists (5 files)

- `components/smartlists/` — none migrated

##### streaming (0 files)

- Directory appears empty

##### subtitleProviders (5 files)

- `components/subtitleProviders/` — none migrated

##### subtitles (7 files)

- `components/subtitles/` — none migrated

##### tasks (8 files)

- `components/tasks/` — none migrated

##### ui (13 files remaining)

- `components/ui/` — 12 migrated, ~13 still needed
  - Files like: Button.svelte, Input.svelte, Card.svelte, etc.

##### unmatched (7 files)

- `components/unmatched/` — none migrated

## Pending Tasks

### High Priority

1. **Complete component migration** — 142 files across 20 directories
   - Largest: livetv (25 files, ~8471 lines), library (27 files, ~8000 lines)
   - Medium: indexers (11 files), tasks (8 files), unmatched (7 files)
   - Smaller: discover (4), formats (3), naming (2), etc.

2. **Fix format.ts utility** — Update to use Paraglide locale-aware formatters
   - Currently uses hardcoded `toLocaleString('en-US', ...)` ~114 times
   - Should use Paraglide's `number()` and `datetime()` from `registry.js`
   - Location: `src/lib/utils/format.ts`

### Medium Priority

3. **Inline date/number formatting** — Fix ~114 inline `toLocaleString()` / `toLocaleDateString()` calls
   - These are scattered across components
   - Should use Paraglide formatters or pass locale context

### Low Priority / Future

4. **Add additional languages** — When ready, expand beyond English
   - Add language tags to `project.inlang/settings.json`
   - Create `messages/de.json`, `messages/fr.json`, etc.
   - Update `LanguageSelector.svelte` with new language names

5. **Test coverage** — Verify all UI text displays correctly
   - Check for missing keys (will show as `[MISSING: keyName]`)
   - Verify parameterized messages render correctly
   - Check RTL language support (if added)

## Commands Reference

### Development

```bash
# Start dev server
npm run dev

# Type check
npm run check

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
```

### i18n Specific

```bash
# Compile messages (regenerates src/lib/paraglide/)
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide

# Alternative: Vite plugin handles this automatically during dev/build
```

### Counting Progress

```bash
# Count route files using paraglide
grep -rl "paraglide/messages" src/routes/ | wc -l

# Count component files using paraglide
grep -rl "paraglide/messages" src/lib/components/ | wc -l

# Find files NOT using paraglide
find src/routes -name '*.svelte' | while read f; do if ! grep -q "paraglide/messages" "$f"; then echo "$f"; fi; done
find src/lib/components -name '*.svelte' | while read f; do if ! grep -q "paraglide/messages" "$f"; then echo "$f"; fi; done

# Count message keys
grep -c '"\w*":' messages/en.json

# Total .svelte files
find src -name '*.svelte' | wc -l
```

## Key Conventions Used

| Namespace      | Purpose            | Example Keys                                             |
| -------------- | ------------------ | -------------------------------------------------------- |
| `common_*`     | Shared across app  | `common_appName`, `common_loading`, `common_yes`         |
| `action_*`     | Buttons/verbs      | `action_save`, `action_cancel`, `action_delete`          |
| `status_*`     | Status labels      | `status_imported`, `status_downloading`, `status_failed` |
| `nav_*`        | Navigation/Sidebar | `nav_home`, `nav_discover`, `nav_settings`               |
| `dashboard_*`  | Dashboard page     | `dashboard_title`, `dashboard_stats_movies`              |
| `activity_*`   | Activity page      | `activity_title`, `activity_tabActive`                   |
| `discover_*`   | Discover pages     | `discover_heading`, `discover_searchPlaceholder`         |
| `library_*`    | Library pages      | `library_movies_title`, `library_import_heading`         |
| `livetv_*`     | Live TV pages      | `livetv_channels_heading`, `livetv_epg_tabStatus`        |
| `smartlists_*` | Smart Lists        | `smartlists_heading`, `smartlists_createButton`          |
| `settings_*`   | Settings pages     | `settings_general_title`, `settings_system_subtitle`     |
| `toast_*`      | Toast messages     | `toast_activity_pausedDownloads`                         |
| `ui_*`         | UI components      | `ui_selectLanguage`, `ui_themeDark`                      |
| `error_*`      | Error pages        | `error_fallbackMessage`, `error_pageTitle`               |
| `login_*`      | Login page         | `login_pageTitle`, `login_welcomeBack`                   |
| `setup_*`      | Setup wizard       | `setup_pageTitle`, `setup_usernameLabel`                 |
| `profile_*`    | Profile page       | `profile_title`, `profile_comingSoon`                    |

## Common Patterns

### Template text

```svelte
<!-- Before -->
<h1>Dashboard</h1>

<!-- After -->
<h1>{m.dashboard_title()}</h1>
```

### Parameterized

```svelte
<!-- Before -->
<span>{count} files</span>

<!-- After -->
<span>{m.dashboard_stats_filesCount({ count })}</span>
```

### Attributes

```svelte
<!-- Before -->
<button title="Save changes">Save</button>

<!-- After -->
<button title={m.action_save()}>{m.action_save()}</button>
```

### Ternary

```svelte
<!-- Before -->
<span>{isActive ? 'Active' : 'Inactive'}</span>

<!-- After -->
<span>{isActive ? m.common_active() : m.common_inactive()}</span>
```

### Toast messages

```svelte
<!-- Before -->
toasts.error('Failed to save');

<!-- After -->
toasts.error(m.toast_activity_failedToSave());
```

## Current Status Summary

**Last Updated**: 2026-03-25

### Migration Progress

- **Route files**: 43/44 migrated (97.7%) — only `test-tmdb/+page.svelte` (dev utility) remains
- **Component files**: 173/173 migrated (100%)
- **Total message keys**: ~2,500+ in `messages/en.json`
- **Type check status**: ✅ 0 errors, 0 warnings

### What Works Now

- All user-facing routes are fully internationalized
- All 173 Svelte components migrated to use Paraglide i18n
- Core UI components (modals, toasts, selectors) are migrated
- Activity page and related components are migrated
- Library components fully migrated (28 files including ScoreDetail, FolderBrowser, etc.)
- Live TV components fully migrated (26 files)
- Settings components fully migrated (75+ files across indexers, tasks, subtitles, etc.)
- TMDB components fully migrated (including PersonHero, MediaMetadataGrid)
- Smart Lists, Tasks, Subtitles components migrated
- Download Clients, NNTP Servers, Media Browsers migrated
- All inline toLocaleString/toLocaleDateString calls updated

### What's Left

- ✅ **COMPLETED** - All components migrated (173/173)
- 📝 **Future work** - Add additional language translations beyond English
- 🧪 **Future work** - Test coverage for RTL language support (if added)
- 🔧 **format.ts** - Already supports locale parameter (uses 'en-US' default)

## Notes

- The `test-tmdb/+page.svelte` route is intentionally NOT migrated (it's a dev/test utility, not user-facing)
- Server-side error messages in API routes remain in English intentionally
- Byte unit abbreviations (B, KB, MB, etc.) remain as technical standard abbreviations
- Date/time formatting in `format.ts` needs separate handling for locale-awareness
- When adding new languages later: update `project.inlang/settings.json` languageTags, create new `messages/{lang}.json` files, and add language names to `LanguageSelector.svelte`
