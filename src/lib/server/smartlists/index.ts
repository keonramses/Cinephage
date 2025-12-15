/**
 * Smart Lists Module
 *
 * TMDB-based smart lists with dynamic filter-based content discovery.
 */

export { SmartListService, getSmartListService } from './SmartListService.js';
export type {
	SmartListFilters,
	SmartListRecord,
	SmartListItemRecord,
	SmartListRefreshHistoryRecord,
	SmartListSortBy,
	AutoAddBehavior,
	SmartListMediaType,
	RefreshStatus,
	CreateSmartListInput,
	UpdateSmartListInput,
	RefreshResult,
	ItemQueryOptions,
	BulkAddResult
} from './types.js';
