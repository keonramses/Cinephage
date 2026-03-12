<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import { createSSE } from '$lib/sse';
	import ActivityTable from '$lib/components/activity/ActivityTable.svelte';
	import ActivityDetailModal from '$lib/components/activity/ActivityDetailModal.svelte';
	import ActivityFilters from '$lib/components/activity/ActivityFilters.svelte';
	import ActiveFilters from '$lib/components/activity/ActiveFilters.svelte';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { formatSpeed } from '$lib/utils/format';
	import {
		isActiveActivity,
		type ActivityScope,
		type UnifiedActivity,
		type ActivityDetails,
		type ActivityFilters as FiltersType,
		type ActivityStatus
	} from '$lib/types/activity';
	import type { ActivityStreamEvents } from '$lib/types/sse/events/activity-events.js';
	import {
		Activity,
		AlertTriangle,
		ArrowDown,
		ArrowUp,
		Download,
		Gauge,
		Loader2,
		Pause,
		Upload,
		Wifi,
		WifiOff
	} from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	let { data } = $props();
	type ActivityTab = Exclude<ActivityScope, 'all'>;
	const ACTIVE_TAB_STATUSES: NonNullable<FiltersType['status']>[] = [
		'all',
		'downloading',
		'seeding',
		'paused',
		'failed'
	];
	const HISTORY_TAB_STATUSES: NonNullable<FiltersType['status']>[] = [
		'all',
		'success',
		'failed',
		'removed',
		'rejected',
		'no_results'
	];
	const BASE_FILTERS: FiltersType = {
		status: 'all',
		mediaType: 'all',
		protocol: 'all'
	};

	function createDefaultFilters(): FiltersType {
		return { ...BASE_FILTERS };
	}

	// Local state for activities (for SSE updates)
	let activities = $state<UnifiedActivity[]>([]);
	let total = $state(0);
	let selectionMode = $state(false);
	let selectedHistoryIds = $state<string[]>([]);
	let activeSelectionMode = $state(false);
	let selectedActiveIds = $state<string[]>([]);
	let canManageHistory = $state(false);
	let retentionDays = $state(90);
	let settingsLoading = $state(true);
	let saveRetentionLoading = $state(false);
	let purgeOlderLoading = $state(false);
	let purgeAllLoading = $state(false);
	let deleteSelectedLoading = $state(false);
	type HistoryConfirmAction = 'purge_older_than_retention' | 'purge_all' | 'delete_selected';
	type ActiveBulkAction = 'pause' | 'resume' | 'retry_failed' | 'remove_failed';
	let historyConfirmOpen = $state(false);
	let historyConfirmAction = $state<HistoryConfirmAction | null>(null);
	let activeConfirmOpen = $state(false);
	let activeConfirmAction = $state<ActiveBulkAction | null>(null);
	let activeBulkLoading = $state(false);

	// Filter state - initialize from URL/data
	let filters = $state<FiltersType>(createDefaultFilters());
	let activeTabFilters = $state<FiltersType>(createDefaultFilters());
	let historyTabFilters = $state<FiltersType>(createDefaultFilters());
	let activityTab = $state<ActivityTab>('history');

	// Sort state
	let sortField = $state('time');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	// Loading states
	let isLoading = $state(false);
	let isLoadingMore = $state(false);

	let refreshInFlight = $state(false);
	let queueStatsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let queueStatsRefreshForcePending = false;
	let queueStatsRequestToken = 0;
	let queueStatsLoading = false;
	let lastQueueStatsLoadedAt = 0;
	let lastActivityRefreshAt = 0;

	const QUEUE_STATS_MIN_REFRESH_MS = 3000;
	const ACTIVITY_REFRESH_MIN_INTERVAL_MS = 10000;

	interface QueueCardStats {
		totalCount: number;
		downloadingCount: number;
		seedingCount: number;
		pausedCount: number;
		failedCount: number;
		totalDownloadSpeed: number;
		totalUploadSpeed: number;
	}

	type QueueCardStatusFilter = Extract<
		NonNullable<FiltersType['status']>,
		'all' | 'downloading' | 'seeding' | 'paused' | 'failed'
	>;

	function createDefaultQueueCardStats(): QueueCardStats {
		return {
			totalCount: 0,
			downloadingCount: 0,
			seedingCount: 0,
			pausedCount: 0,
			failedCount: 0,
			totalDownloadSpeed: 0,
			totalUploadSpeed: 0
		};
	}

	let queueStats = $state<QueueCardStats>(createDefaultQueueCardStats());
	const queueDownloadSpeedLabel = $derived.by(() => formatSpeed(queueStats.totalDownloadSpeed));
	const queueUploadSpeedLabel = $derived.by(() => formatSpeed(queueStats.totalUploadSpeed));

	function getAllowedStatuses(tab: ActivityTab): NonNullable<FiltersType['status']>[] {
		return tab === 'active' ? ACTIVE_TAB_STATUSES : HISTORY_TAB_STATUSES;
	}

	function normalizeFiltersForTab(nextFilters: FiltersType, tab: ActivityTab): FiltersType {
		const normalized = { ...nextFilters };
		const status = normalized.status ?? 'all';
		if (!getAllowedStatuses(tab).includes(status)) {
			normalized.status = 'all';
		}

		if (tab === 'active') {
			normalized.includeNoResults = undefined;
		}

		return normalized;
	}

	function getFiltersForTab(tab: ActivityTab): FiltersType {
		return tab === 'active' ? activeTabFilters : historyTabFilters;
	}

	function setFiltersForTab(tab: ActivityTab, nextFilters: FiltersType): void {
		if (tab === 'active') {
			activeTabFilters = { ...nextFilters };
			return;
		}
		historyTabFilters = { ...nextFilters };
	}

	function matchesTabScope(activity: UnifiedActivity): boolean {
		return activityTab === 'active' ? isActiveActivity(activity) : !isActiveActivity(activity);
	}

	function isHistoryActivity(activity: UnifiedActivity): boolean {
		const isHistoryRow =
			activity.id.startsWith('history-') || activity.id.startsWith('monitoring-');
		if (!isHistoryRow) return false;

		// Keep failed activities retryable via queue actions; don't allow bulk-delete selection.
		if (activity.status === 'failed' && activity.queueItemId) return false;

		return true;
	}

	function isActiveQueueActivity(activity: UnifiedActivity): boolean {
		return isActiveActivity(activity) && Boolean(activity.queueItemId);
	}

	function toggleSelectionMode(): void {
		selectionMode = !selectionMode;
		if (!selectionMode) {
			selectedHistoryIds = [];
		}
	}

	function handleToggleSelection(activityId: string, selected: boolean): void {
		if (selected) {
			if (!selectedHistoryIds.includes(activityId)) {
				selectedHistoryIds = [...selectedHistoryIds, activityId];
			}
		} else {
			selectedHistoryIds = selectedHistoryIds.filter((id) => id !== activityId);
		}
	}

	function handleToggleSelectionAll(activityIds: string[], selected: boolean): void {
		if (selected) {
			const merged = [...selectedHistoryIds];
			for (const id of activityIds) {
				if (!merged.includes(id)) {
					merged.push(id);
				}
			}
			selectedHistoryIds = merged;
			return;
		}

		selectedHistoryIds = selectedHistoryIds.filter((id) => !activityIds.includes(id));
	}

	function toggleActiveSelectionMode(): void {
		activeSelectionMode = !activeSelectionMode;
		if (!activeSelectionMode) {
			selectedActiveIds = [];
		}
	}

	function handleToggleActiveSelection(activityId: string, selected: boolean): void {
		if (selected) {
			if (!selectedActiveIds.includes(activityId)) {
				selectedActiveIds = [...selectedActiveIds, activityId];
			}
		} else {
			selectedActiveIds = selectedActiveIds.filter((id) => id !== activityId);
		}
	}

	function handleToggleActiveSelectionAll(activityIds: string[], selected: boolean): void {
		if (selected) {
			const merged = [...selectedActiveIds];
			for (const id of activityIds) {
				if (!merged.includes(id)) {
					merged.push(id);
				}
			}
			selectedActiveIds = merged;
			return;
		}

		selectedActiveIds = selectedActiveIds.filter((id) => !activityIds.includes(id));
	}

	function reconcileSelectedHistoryIds(sourceActivities: UnifiedActivity[]): void {
		const next = selectedHistoryIds.filter((id) =>
			sourceActivities.some((activity) => activity.id === id && isHistoryActivity(activity))
		);
		if (
			next.length === selectedHistoryIds.length &&
			next.every((id, i) => id === selectedHistoryIds[i])
		) {
			return;
		}
		selectedHistoryIds = next;
	}

	function reconcileSelectedActiveIds(sourceActivities: UnifiedActivity[]): void {
		const next = selectedActiveIds.filter((id) =>
			sourceActivities.some((activity) => activity.id === id && isActiveQueueActivity(activity))
		);
		if (
			next.length === selectedActiveIds.length &&
			next.every((id, i) => id === selectedActiveIds[i])
		) {
			return;
		}
		selectedActiveIds = next;
	}

	function getSelectedQueueIdsByStatus(statuses: ActivityStatus[]): string[] {
		const queueIds: string[] = [];

		for (const activity of activities) {
			if (!selectedActiveIds.includes(activity.id)) continue;
			if (!isActiveQueueActivity(activity) || !activity.queueItemId) continue;
			if (!statuses.includes(activity.status)) continue;
			if (!queueIds.includes(activity.queueItemId)) {
				queueIds.push(activity.queueItemId);
			}
		}

		return queueIds;
	}

	const selectedPausableQueueIds = $derived.by(() =>
		getSelectedQueueIdsByStatus(['downloading', 'seeding'])
	);
	const selectedPausedQueueIds = $derived.by(() => getSelectedQueueIdsByStatus(['paused']));
	const selectedFailedQueueIds = $derived.by(() => getSelectedQueueIdsByStatus(['failed']));

	function getActiveBulkActionQueueIds(action: ActiveBulkAction): string[] {
		switch (action) {
			case 'pause':
				return selectedPausableQueueIds;
			case 'resume':
				return selectedPausedQueueIds;
			case 'retry_failed':
			case 'remove_failed':
				return selectedFailedQueueIds;
		}
	}

	function normalizeActivityStatus(status: unknown): ActivityStatus {
		switch (status) {
			case 'imported':
			case 'streaming':
			case 'downloading':
			case 'seeding':
			case 'paused':
			case 'failed':
			case 'rejected':
			case 'removed':
			case 'no_results':
			case 'searching':
				return status;
			default:
				return 'downloading';
		}
	}

	function normalizeActivity(activity: Partial<UnifiedActivity>): UnifiedActivity | null {
		if (!activity.id) return null;

		return {
			id: activity.id,
			mediaType: activity.mediaType === 'episode' ? 'episode' : 'movie',
			mediaId: activity.mediaId ?? '',
			mediaTitle: activity.mediaTitle ?? 'Unknown',
			mediaYear: activity.mediaYear ?? null,
			seriesId: activity.seriesId,
			seriesTitle: activity.seriesTitle,
			seasonNumber: activity.seasonNumber,
			episodeNumber: activity.episodeNumber,
			episodeIds: activity.episodeIds,
			releaseTitle: activity.releaseTitle ?? null,
			quality: activity.quality ?? null,
			releaseGroup: activity.releaseGroup ?? null,
			size: activity.size ?? null,
			indexerId: activity.indexerId ?? null,
			indexerName: activity.indexerName ?? null,
			protocol: activity.protocol ?? null,
			downloadClientId: activity.downloadClientId ?? null,
			downloadClientName: activity.downloadClientName ?? null,
			status: normalizeActivityStatus(activity.status),
			statusReason: activity.statusReason,
			downloadProgress: activity.downloadProgress,
			isUpgrade: activity.isUpgrade ?? false,
			oldScore: activity.oldScore,
			newScore: activity.newScore,
			timeline: Array.isArray(activity.timeline) ? activity.timeline : [],
			startedAt: activity.startedAt ?? new Date().toISOString(),
			completedAt: activity.completedAt ?? null,
			queueItemId: activity.queueItemId,
			downloadHistoryId: activity.downloadHistoryId,
			monitoringHistoryId: activity.monitoringHistoryId,
			importedPath: activity.importedPath
		};
	}

	function compareActivityPriority(a: UnifiedActivity, b: UnifiedActivity): number {
		const aPriority = a.status === 'downloading' || a.status === 'seeding' ? 0 : 1;
		const bPriority = b.status === 'downloading' || b.status === 'seeding' ? 0 : 1;
		return aPriority - bPriority;
	}

	function getSortValue(activity: UnifiedActivity, field: string): string | number {
		switch (field) {
			case 'time':
				return activity.startedAt;
			case 'media':
				return activity.mediaTitle.toLowerCase();
			case 'size':
				return activity.size || 0;
			case 'status':
				return activity.status;
			case 'release':
				return activity.releaseTitle?.toLowerCase() || '';
			default:
				return activity.startedAt;
		}
	}

	function sortActivitiesList(
		list: UnifiedActivity[],
		field: string = sortField,
		direction: 'asc' | 'desc' = sortDirection
	): UnifiedActivity[] {
		return [...list].sort((a, b) => {
			const priorityComparison = compareActivityPriority(a, b);
			if (priorityComparison !== 0) {
				return priorityComparison;
			}

			const aVal = getSortValue(a, field);
			const bVal = getSortValue(b, field);

			let comparison = 0;
			if (aVal < bVal) comparison = -1;
			if (aVal > bVal) comparison = 1;

			if (comparison === 0) {
				const aTime = new Date(a.startedAt).getTime();
				const bTime = new Date(b.startedAt).getTime();
				comparison = aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
			}

			return direction === 'asc' ? comparison : -comparison;
		});
	}

	function readQueueStatsNumber(value: unknown): number {
		const numeric = typeof value === 'number' ? value : Number(value ?? 0);
		return Number.isFinite(numeric) ? numeric : 0;
	}

	function parseQueueStats(rawStats: Partial<QueueCardStats> | null | undefined): QueueCardStats {
		return {
			totalCount: readQueueStatsNumber(rawStats?.totalCount),
			downloadingCount: readQueueStatsNumber(rawStats?.downloadingCount),
			seedingCount: readQueueStatsNumber(rawStats?.seedingCount),
			pausedCount: readQueueStatsNumber(rawStats?.pausedCount),
			failedCount: readQueueStatsNumber(rawStats?.failedCount),
			totalDownloadSpeed: readQueueStatsNumber(rawStats?.totalDownloadSpeed),
			totalUploadSpeed: readQueueStatsNumber(rawStats?.totalUploadSpeed)
		};
	}

	async function loadQueueStats(options: { force?: boolean } = {}): Promise<void> {
		if (activityTab !== 'active') return;
		if (queueStatsLoading) return;

		const { force = false } = options;
		const now = Date.now();
		if (!force && now - lastQueueStatsLoadedAt < QUEUE_STATS_MIN_REFRESH_MS) {
			return;
		}

		const requestToken = ++queueStatsRequestToken;
		queueStatsLoading = true;

		try {
			const response = await fetch('/api/activity/stats');
			if (!response.ok) {
				throw new Error('Failed to load queue stats');
			}

			const payload = await response.json();
			if (requestToken !== queueStatsRequestToken) return;

			const rawStats = (payload?.data ?? null) as Partial<QueueCardStats> | null;
			queueStats = parseQueueStats(rawStats);
			lastQueueStatsLoadedAt = Date.now();
		} catch (error) {
			console.error('Failed to load queue stats:', error);
		} finally {
			queueStatsLoading = false;
		}
	}

	function scheduleQueueStatsRefresh(delayMs = 400, options: { force?: boolean } = {}): void {
		if (activityTab !== 'active') return;

		const { force = false } = options;
		queueStatsRefreshForcePending = queueStatsRefreshForcePending || force;
		if (queueStatsRefreshTimer) {
			return;
		}

		queueStatsRefreshTimer = setTimeout(() => {
			const nextForce = queueStatsRefreshForcePending;
			queueStatsRefreshForcePending = false;
			queueStatsRefreshTimer = null;
			void loadQueueStats({ force: nextForce });
		}, delayMs);
	}

	function isQueueCardFilterActive(status: QueueCardStatusFilter): boolean {
		return activityTab === 'active' && (filters.status ?? 'all') === status;
	}

	async function applyQueueCardFilter(status: QueueCardStatusFilter): Promise<void> {
		if (activityTab !== 'active') return;
		const currentStatus = filters.status ?? 'all';
		if (currentStatus === status) return;
		await applyFilters({ ...filters, status }, 'active');
	}

	function matchesLiveFilters(activity: UnifiedActivity): boolean {
		if (!matchesTabScope(activity)) return false;

		// Status
		if (filters.status && filters.status !== 'all') {
			if (filters.status === 'success') {
				if (activity.status !== 'imported' && activity.status !== 'streaming') return false;
			} else if (activity.status !== filters.status) {
				return false;
			}
		}

		// Media type
		if (filters.mediaType === 'movie' && activity.mediaType !== 'movie') return false;
		if (filters.mediaType === 'tv' && activity.mediaType !== 'episode') return false;

		// Search
		if (filters.search) {
			const needle = filters.search.toLowerCase();
			const matches =
				activity.mediaTitle.toLowerCase().includes(needle) ||
				activity.releaseTitle?.toLowerCase().includes(needle) ||
				activity.seriesTitle?.toLowerCase().includes(needle) ||
				activity.releaseGroup?.toLowerCase().includes(needle) ||
				activity.indexerName?.toLowerCase().includes(needle);
			if (!matches) return false;
		}

		// Protocol
		if (filters.protocol && filters.protocol !== 'all' && activity.protocol !== filters.protocol) {
			return false;
		}

		// Download client
		if (filters.downloadClientId && activity.downloadClientId !== filters.downloadClientId) {
			return false;
		}

		// Indexer
		if (filters.indexer && activity.indexerName?.toLowerCase() !== filters.indexer.toLowerCase()) {
			return false;
		}

		// Release group
		if (
			filters.releaseGroup &&
			!activity.releaseGroup?.toLowerCase().includes(filters.releaseGroup.toLowerCase())
		) {
			return false;
		}

		// Resolution
		if (
			filters.resolution &&
			activity.quality?.resolution?.toLowerCase() !== filters.resolution.toLowerCase()
		) {
			return false;
		}

		// Upgrade flag
		if (filters.isUpgrade !== undefined && activity.isUpgrade !== filters.isUpgrade) return false;

		// Date range
		if (filters.startDate) {
			const startTime = new Date(filters.startDate).getTime();
			if (new Date(activity.startedAt).getTime() < startTime) return false;
		}
		if (filters.endDate) {
			const endTime = new Date(filters.endDate).getTime() + 86_399_999;
			if (new Date(activity.startedAt).getTime() > endTime) return false;
		}

		return true;
	}

	function isQueueActivityId(activityId: string): boolean {
		return activityId.startsWith('queue-');
	}

	function shouldSyncSelectedActivity(
		selected: UnifiedActivity,
		incoming: Pick<UnifiedActivity, 'id' | 'queueItemId' | 'status'>
	): boolean {
		if (selected.id === incoming.id) return true;
		if (!selected.queueItemId || !incoming.queueItemId) return false;
		if (selected.queueItemId !== incoming.queueItemId) return false;

		const selectedIsQueue = isQueueActivityId(selected.id);
		const incomingIsQueue = isQueueActivityId(incoming.id);

		// While queue and history rows may coexist briefly, prefer queue-origin updates.
		if (selectedIsQueue && !incomingIsQueue && incoming.status === 'failed') {
			return false;
		}

		return true;
	}

	function removeStaleQueueLinkedRows(queueActivity: UnifiedActivity): number {
		if (!isQueueActivityId(queueActivity.id) || !queueActivity.queueItemId) {
			return 0;
		}

		const staleRowIds = new Set(
			activities
				.filter(
					(activity) =>
						activity.id !== queueActivity.id &&
						!isQueueActivityId(activity.id) &&
						activity.queueItemId === queueActivity.queueItemId
				)
				.map((activity) => activity.id)
		);

		if (staleRowIds.size === 0) {
			return 0;
		}

		activities = activities.filter((activity) => !staleRowIds.has(activity.id));

		if (
			selectedActivity &&
			selectedActivity.queueItemId === queueActivity.queueItemId &&
			staleRowIds.has(selectedActivity.id)
		) {
			selectedActivity = queueActivity;
		}

		return staleRowIds.size;
	}

	function upsertActivity(activity: Partial<UnifiedActivity>): void {
		const normalized = normalizeActivity(activity);
		if (!normalized) return;

		const existingIndex = activities.findIndex((a) => a.id === normalized.id);
		const matchesFilters = matchesLiveFilters(normalized);

		if (!matchesFilters) {
			if (existingIndex >= 0) {
				activities = activities.filter((a) => a.id !== normalized.id);
				total = Math.max(0, total - 1);
				if (selectedActivity && shouldSyncSelectedActivity(selectedActivity, normalized)) {
					selectedActivity = { ...selectedActivity, ...normalized };
				}
			}
			return;
		}

		if (existingIndex >= 0) {
			const existing = activities[existingIndex];
			Object.assign(existing, normalized);
			const removedDuplicates = removeStaleQueueLinkedRows(existing);
			if (
				selectedActivity &&
				selectedActivity !== existing &&
				shouldSyncSelectedActivity(selectedActivity, existing)
			) {
				selectedActivity = existing;
			}
			if (removedDuplicates > 0) {
				total = Math.max(0, total - removedDuplicates);
			}
			activities = sortActivitiesList(activities);
			return;
		}

		activities = sortActivitiesList([normalized, ...activities]);
		const removedDuplicates = removeStaleQueueLinkedRows(normalized);
		total = Math.max(0, total + 1 - removedDuplicates);
	}

	// Detail modal state
	let selectedActivity = $state<UnifiedActivity | null>(null);
	let activityDetails = $state<ActivityDetails | null>(null);
	let detailsLoading = $state(false);
	let isModalOpen = $state(false);

	// Update activities when data changes (navigation)
	$effect(() => {
		const nextTab = data.tab === 'active' ? 'active' : 'history';
		activityTab = nextTab;
		activities = data.activities;
		total = data.total;
		reconcileSelectedHistoryIds(data.activities);
		reconcileSelectedActiveIds(data.activities);
		if (data.filters) {
			const resolvedFilters = { ...data.filters };
			filters = resolvedFilters;
			setFiltersForTab(nextTab, resolvedFilters);
		}
	});

	$effect(() => {
		reconcileSelectedHistoryIds(activities);
		reconcileSelectedActiveIds(activities);
	});

	$effect(() => {
		const currentSelected = selectedActivity;
		if (!currentSelected) return;

		const linkedById = activities.find((activity) => activity.id === currentSelected.id);
		const linkedByQueueId = currentSelected.queueItemId
			? activities.filter((activity) => activity.queueItemId === currentSelected.queueItemId)
			: [];
		const preferredByQueueId =
			linkedByQueueId.find((activity) => isQueueActivityId(activity.id)) || linkedByQueueId[0];
		const linkedActivity = linkedById || preferredByQueueId;

		if (
			linkedActivity &&
			linkedActivity !== currentSelected &&
			shouldSyncSelectedActivity(currentSelected, linkedActivity)
		) {
			selectedActivity = linkedActivity;
		}
	});

	$effect(() => {
		if (activityTab !== 'history' && (selectionMode || selectedHistoryIds.length > 0)) {
			selectionMode = false;
			selectedHistoryIds = [];
		}
		if (activityTab !== 'active' && (activeSelectionMode || selectedActiveIds.length > 0)) {
			activeSelectionMode = false;
			selectedActiveIds = [];
		}
		if (activityTab !== 'active' && activeConfirmOpen && !activeBulkLoading) {
			activeConfirmOpen = false;
			activeConfirmAction = null;
		}
	});

	$effect(() => {
		if (activityTab === 'active') {
			scheduleQueueStatsRefresh(0, { force: true });
			return;
		}

		if (queueStatsRefreshTimer) {
			clearTimeout(queueStatsRefreshTimer);
			queueStatsRefreshTimer = null;
		}
		queueStatsRefreshForcePending = false;
	});

	// SSE Connection - internally handles browser/SSR
	const sse = createSSE<ActivityStreamEvents>(
		resolvePath('/api/activity/stream'),
		{
			'activity:new': (newActivity) => {
				upsertActivity(newActivity);
				scheduleQueueStatsRefresh();
			},
			'activity:updated': (updated) => {
				upsertActivity(updated);
				scheduleQueueStatsRefresh();
			},
			'activity:progress': (data) => {
				let removed = false;
				const queueItemId = data.id.startsWith('queue-')
					? data.id.slice('queue-'.length)
					: undefined;

				activities = activities.flatMap((a) => {
					if (a.id !== data.id) return [a];

					a.downloadProgress = data.progress;
					a.status = data.status ? normalizeActivityStatus(data.status) : a.status;

					if (!matchesLiveFilters(a)) {
						removed = true;
						return [];
					}

					return [a];
				});

				activities = sortActivitiesList(activities);

				if (removed) {
					total = Math.max(0, total - 1);
				}

				if (
					selectedActivity &&
					(selectedActivity.id === data.id ||
						(queueItemId && selectedActivity.queueItemId === queueItemId))
				) {
					selectedActivity.downloadProgress = data.progress;
					if (data.status) {
						selectedActivity.status = normalizeActivityStatus(data.status);
					}
					selectedActivity = { ...selectedActivity };
				}

				scheduleQueueStatsRefresh(750);
			},
			'activity:refresh': () => {
				void refreshActivityData({ force: true });
			}
		},
		{
			maxRetries: Infinity
		}
	);

	async function refreshActivityData(options: { force?: boolean } = {}): Promise<void> {
		const { force = false } = options;
		if (refreshInFlight) return;
		const now = Date.now();
		if (!force && now - lastActivityRefreshAt < ACTIVITY_REFRESH_MIN_INTERVAL_MS) {
			return;
		}

		refreshInFlight = true;
		try {
			await Promise.all([invalidateAll(), loadQueueStats({ force })]);
		} finally {
			refreshInFlight = false;
			lastActivityRefreshAt = Date.now();
		}
	}

	async function loadHistorySettings(): Promise<void> {
		settingsLoading = true;
		try {
			const response = await fetch('/api/activity/settings');
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				return;
			}
			if (!response.ok) {
				throw new Error('Failed to load history settings');
			}

			const payload = await response.json();
			if (payload.success && typeof payload.retentionDays === 'number') {
				retentionDays = payload.retentionDays;
			}
			canManageHistory = true;
		} catch (error) {
			console.error('Failed to load history settings:', error);
			canManageHistory = false;
		} finally {
			settingsLoading = false;
		}
	}

	onMount(() => {
		// Ensure we don't show stale client-side snapshot state after route back/forward.
		void refreshActivityData({ force: true });
		void loadHistorySettings();

		const handleFocus = () => {
			if (!sse.isConnected) {
				void refreshActivityData();
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible' && !sse.isConnected) {
				void refreshActivityData();
			}
		};

		const handlePageShow = () => {
			void refreshActivityData();
		};

		window.addEventListener('focus', handleFocus);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('pageshow', handlePageShow);

		return () => {
			if (queueStatsRefreshTimer) {
				clearTimeout(queueStatsRefreshTimer);
				queueStatsRefreshTimer = null;
			}
			queueStatsRefreshForcePending = false;
			window.removeEventListener('focus', handleFocus);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('pageshow', handlePageShow);
		};
	});

	async function saveRetention(): Promise<void> {
		if (!canManageHistory || saveRetentionLoading) return;

		saveRetentionLoading = true;
		try {
			const response = await fetch('/api/activity/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ retentionDays })
			});
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				throw new Error('Admin access is required');
			}

			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.success) {
				throw new Error(
					typeof payload.error === 'string' ? payload.error : 'Failed to save retention setting'
				);
			}

			retentionDays = payload.retentionDays ?? retentionDays;
			toasts.success(`Retention updated to ${retentionDays} day${retentionDays === 1 ? '' : 's'}`);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to save retention setting');
		} finally {
			saveRetentionLoading = false;
		}
	}

	const historyConfirmTitle = $derived.by((): string => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return 'Purge All Activity History';
			case 'purge_older_than_retention':
				return 'Purge Older Activity History';
			case 'delete_selected':
				return 'Delete Selected History';
			default:
				return 'Confirm Action';
		}
	});

	const historyConfirmMessage = $derived.by((): string => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return 'Permanently delete all activity history? This cannot be undone.';
			case 'purge_older_than_retention':
				return `Delete activity history older than ${retentionDays} days? This cannot be undone.`;
			case 'delete_selected':
				return `Delete ${selectedHistoryIds.length} selected history row${selectedHistoryIds.length === 1 ? '' : 's'}? This cannot be undone.`;
			default:
				return '';
		}
	});

	const historyConfirmLabel = $derived.by((): string => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return 'Purge All';
			case 'purge_older_than_retention':
				return 'Purge Older';
			case 'delete_selected':
				return 'Delete Selected';
			default:
				return 'Confirm';
		}
	});

	const historyConfirmLoading = $derived.by((): boolean => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return purgeAllLoading;
			case 'purge_older_than_retention':
				return purgeOlderLoading;
			case 'delete_selected':
				return deleteSelectedLoading;
			default:
				return false;
		}
	});

	const activeConfirmTargetCount = $derived.by(() =>
		activeConfirmAction ? getActiveBulkActionQueueIds(activeConfirmAction).length : 0
	);

	const activeConfirmSkippedCount = $derived.by(() =>
		Math.max(0, selectedActiveIds.length - activeConfirmTargetCount)
	);

	const activeConfirmTitle = $derived.by((): string => {
		switch (activeConfirmAction) {
			case 'pause':
				return 'Pause Selected Downloads';
			case 'resume':
				return 'Resume Selected Downloads';
			case 'retry_failed':
				return 'Retry Failed Downloads';
			case 'remove_failed':
				return 'Remove Failed Downloads';
			default:
				return 'Confirm Action';
		}
	});

	const activeConfirmMessage = $derived.by((): string => {
		const targetCount = activeConfirmTargetCount;
		const targetLabel = `${targetCount} queue item${targetCount === 1 ? '' : 's'}`;
		const skippedSuffix =
			activeConfirmSkippedCount > 0
				? ` ${activeConfirmSkippedCount} selected row${activeConfirmSkippedCount === 1 ? '' : 's'} do not match this action and will be skipped.`
				: '';

		switch (activeConfirmAction) {
			case 'pause':
				return `Pause ${targetLabel}?${skippedSuffix}`;
			case 'resume':
				return `Resume ${targetLabel}?${skippedSuffix}`;
			case 'retry_failed':
				return `Retry ${targetLabel}? Completed-client failures retry import first; other failures re-download.${skippedSuffix}`;
			case 'remove_failed':
				return `Remove ${targetLabel} from the queue? This cannot be undone.${skippedSuffix}`;
			default:
				return '';
		}
	});

	const activeConfirmLabel = $derived.by((): string => {
		switch (activeConfirmAction) {
			case 'pause':
				return 'Pause Selected';
			case 'resume':
				return 'Resume Selected';
			case 'retry_failed':
				return 'Retry Failed';
			case 'remove_failed':
				return 'Remove Failed';
			default:
				return 'Confirm';
		}
	});

	const activeConfirmVariant = $derived.by((): 'error' | 'warning' | 'primary' => {
		switch (activeConfirmAction) {
			case 'remove_failed':
				return 'error';
			case 'retry_failed':
				return 'warning';
			default:
				return 'primary';
		}
	});

	function openHistoryConfirm(action: HistoryConfirmAction): void {
		if (!canManageHistory) return;
		if (action === 'purge_all' && (settingsLoading || purgeAllLoading)) return;
		if (action === 'purge_older_than_retention' && (settingsLoading || purgeOlderLoading)) return;
		if (action === 'delete_selected' && (deleteSelectedLoading || selectedHistoryIds.length === 0))
			return;

		historyConfirmAction = action;
		historyConfirmOpen = true;
	}

	function closeHistoryConfirm(): void {
		if (historyConfirmLoading) return;
		historyConfirmOpen = false;
		historyConfirmAction = null;
	}

	async function handleHistoryConfirm(): Promise<void> {
		if (!historyConfirmAction || historyConfirmLoading) return;

		if (historyConfirmAction === 'purge_all') {
			await purgeHistory('all');
		} else if (historyConfirmAction === 'purge_older_than_retention') {
			await purgeHistory('older_than_retention');
		} else {
			await deleteSelectedHistory();
		}

		historyConfirmOpen = false;
		historyConfirmAction = null;
	}

	async function purgeHistory(action: 'older_than_retention' | 'all'): Promise<void> {
		if (!canManageHistory) return;
		if (action === 'older_than_retention' && purgeOlderLoading) return;
		if (action === 'all' && purgeAllLoading) return;

		if (action === 'all') {
			purgeAllLoading = true;
		} else {
			purgeOlderLoading = true;
		}

		try {
			const response = await fetch('/api/activity/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				throw new Error('Admin access is required');
			}

			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.success) {
				throw new Error(
					typeof payload.error === 'string' ? payload.error : 'Failed to purge activity entries'
				);
			}

			const totalDeleted =
				typeof payload.totalDeleted === 'number'
					? payload.totalDeleted
					: (payload.deletedDownloadHistory ?? 0) + (payload.deletedMonitoringHistory ?? 0);
			toasts.success(
				`Deleted ${totalDeleted} activity ${totalDeleted === 1 ? 'entry' : 'entries'}`
			);
			selectedHistoryIds = [];
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to purge activity entries');
			return;
		}

		try {
			await refreshActivityData({ force: true });
		} catch (error) {
			console.error('Activity refresh failed after purge:', error);
			toasts.info('Purge completed. Activity list will refresh shortly.');
		} finally {
			purgeOlderLoading = false;
			purgeAllLoading = false;
		}
	}

	async function deleteSelectedHistory(): Promise<void> {
		if (!canManageHistory || deleteSelectedLoading || selectedHistoryIds.length === 0) return;

		deleteSelectedLoading = true;
		try {
			const response = await fetch('/api/activity', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ activityIds: selectedHistoryIds })
			});
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				throw new Error('Admin access is required');
			}

			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.success) {
				throw new Error(
					typeof payload.error === 'string'
						? payload.error
						: 'Failed to delete selected activity entries'
				);
			}

			const totalDeleted =
				typeof payload.totalDeleted === 'number'
					? payload.totalDeleted
					: (payload.deletedDownloadHistory ?? 0) + (payload.deletedMonitoringHistory ?? 0);
			const skippedQueue = typeof payload.skippedQueue === 'number' ? payload.skippedQueue : 0;
			const skippedRetryableFailed =
				typeof payload.skippedRetryableFailed === 'number' ? payload.skippedRetryableFailed : 0;

			toasts.success(
				`Deleted ${totalDeleted} activity ${totalDeleted === 1 ? 'entry' : 'entries'}`
			);
			if (skippedQueue > 0) {
				toasts.info(
					`${skippedQueue} active download ${skippedQueue === 1 ? 'item was' : 'items were'} skipped (use queue actions to remove them)`
				);
			}
			if (skippedRetryableFailed > 0) {
				toasts.info(
					`${skippedRetryableFailed} failed activity ${skippedRetryableFailed === 1 ? 'entry was' : 'entries were'} kept because retry is still available`
				);
			}

			selectedHistoryIds = [];
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : 'Failed to delete selected activity entries'
			);
			return;
		}

		try {
			await refreshActivityData({ force: true });
		} catch (error) {
			console.error('Activity refresh failed after delete selected:', error);
			toasts.info('Delete completed. Activity list will refresh shortly.');
		} finally {
			deleteSelectedLoading = false;
		}
	}

	function openActiveConfirm(action: ActiveBulkAction): void {
		if (activityTab !== 'active' || !activeSelectionMode || activeBulkLoading) return;
		if (getActiveBulkActionQueueIds(action).length === 0) return;

		activeConfirmAction = action;
		activeConfirmOpen = true;
	}

	function closeActiveConfirm(): void {
		if (activeBulkLoading) return;
		activeConfirmOpen = false;
		activeConfirmAction = null;
	}

	async function handleActiveConfirm(): Promise<void> {
		if (!activeConfirmAction || activeBulkLoading) return;

		await executeActiveBulkAction(activeConfirmAction);
		activeConfirmOpen = false;
		activeConfirmAction = null;
	}

	async function executeActiveBulkAction(action: ActiveBulkAction): Promise<void> {
		const queueIds = getActiveBulkActionQueueIds(action);
		if (queueIds.length === 0) return;

		activeBulkLoading = true;
		let successCount = 0;
		let failedCount = 0;
		let firstFailureMessage: string | null = null;

		const runForQueueId =
			action === 'pause'
				? (queueId: string) => runQueueAction(queueId, 'pause')
				: action === 'resume'
					? (queueId: string) => runQueueAction(queueId, 'resume')
					: action === 'retry_failed'
						? (queueId: string) => retryQueueItem(queueId, { refresh: false })
						: (queueId: string) =>
								removeQueueItem(queueId, { refresh: false, closeDetailModal: false });

		for (const queueId of queueIds) {
			try {
				await runForQueueId(queueId);
				successCount += 1;
			} catch (error) {
				failedCount += 1;
				if (!firstFailureMessage) {
					firstFailureMessage =
						error instanceof Error ? error.message : 'One or more actions failed';
				}
			}
		}

		try {
			if (successCount > 0 && (action === 'retry_failed' || action === 'remove_failed')) {
				await refreshActivityData({ force: true });
			}
		} catch (error) {
			console.error('Activity refresh failed after bulk queue action:', error);
			toasts.info('Queue action completed. Activity list will refresh shortly.');
		} finally {
			activeBulkLoading = false;
		}

		const actionPastTense =
			action === 'pause'
				? 'Paused'
				: action === 'resume'
					? 'Resumed'
					: action === 'retry_failed'
						? 'Retried'
						: 'Removed';
		const actionVerb =
			action === 'pause'
				? 'pause'
				: action === 'resume'
					? 'resume'
					: action === 'retry_failed'
						? 'retry'
						: 'remove';

		if (successCount > 0) {
			toasts.success(`${actionPastTense} ${successCount} download${successCount === 1 ? '' : 's'}`);
		}
		if (failedCount > 0) {
			const suffix = firstFailureMessage ? ` First error: ${firstFailureMessage}` : '';
			toasts.error(
				`Failed to ${actionVerb} ${failedCount} download${failedCount === 1 ? '' : 's'}.${suffix}`
			);
		}

		if (action === 'retry_failed' || action === 'remove_failed') {
			selectedActiveIds = [];
		}
	}

	// Apply filters via URL navigation
	async function applyFilters(newFilters: FiltersType, tab: ActivityTab = activityTab) {
		const normalizedFilters = normalizeFiltersForTab(newFilters, tab);
		const previousFilters = { ...filters };
		const previousTab = activityTab;
		const previousActiveTabFilters = { ...activeTabFilters };
		const previousHistoryTabFilters = { ...historyTabFilters };
		filters = normalizedFilters;
		activityTab = tab;
		setFiltersForTab(tab, normalizedFilters);
		isLoading = true;

		const params = new SvelteURLSearchParams();
		params.set('tab', tab);
		if (normalizedFilters.status !== 'all') params.set('status', normalizedFilters.status!);
		if (normalizedFilters.mediaType !== 'all')
			params.set('mediaType', normalizedFilters.mediaType!);
		if (normalizedFilters.search) params.set('search', normalizedFilters.search);
		if (normalizedFilters.protocol !== 'all') params.set('protocol', normalizedFilters.protocol!);
		if (normalizedFilters.indexer) params.set('indexer', normalizedFilters.indexer);
		if (normalizedFilters.releaseGroup) params.set('releaseGroup', normalizedFilters.releaseGroup);
		if (normalizedFilters.resolution) params.set('resolution', normalizedFilters.resolution);
		if (normalizedFilters.isUpgrade) params.set('isUpgrade', 'true');
		if (normalizedFilters.includeNoResults) params.set('includeNoResults', 'true');
		if (normalizedFilters.downloadClientId)
			params.set('downloadClientId', normalizedFilters.downloadClientId);
		if (normalizedFilters.startDate) params.set('startDate', normalizedFilters.startDate);
		if (normalizedFilters.endDate) params.set('endDate', normalizedFilters.endDate);

		const queryString = params.toString();
		try {
			await goto(resolvePath(`/activity${queryString ? `?${queryString}` : ''}`), {
				keepFocus: true
			});
		} catch (error) {
			console.error('Failed to apply activity filters:', error);
			filters = previousFilters;
			activityTab = previousTab;
			activeTabFilters = previousActiveTabFilters;
			historyTabFilters = previousHistoryTabFilters;
		} finally {
			isLoading = false;
		}
	}

	async function switchTab(tab: ActivityTab): Promise<void> {
		if (tab === activityTab) return;
		await applyFilters(getFiltersForTab(tab), tab);
	}

	// Remove a specific filter
	async function removeFilter(key: keyof FiltersType) {
		const newFilters = { ...filters };
		if (key === 'status' || key === 'mediaType' || key === 'protocol') {
			newFilters[key] = 'all';
		} else {
			delete newFilters[key];
		}
		await applyFilters(newFilters);
	}

	// Clear all filters
	async function clearAllFilters() {
		await applyFilters({
			status: 'all',
			mediaType: 'all',
			protocol: 'all'
		});
	}

	// Handle sort
	function handleSort(field: string) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}

		activities = sortActivitiesList(activities, field, sortDirection);
	}

	// Load more
	async function loadMore() {
		if (isLoadingMore || !data.hasMore) return;
		isLoadingMore = true;

		try {
			const apiUrl = new URL('/api/activity', window.location.origin);
			apiUrl.searchParams.set('limit', '50');
			apiUrl.searchParams.set('offset', String(activities.length));
			apiUrl.searchParams.set('scope', activityTab);
			if (filters.status !== 'all') apiUrl.searchParams.set('status', filters.status!);
			if (filters.mediaType !== 'all') apiUrl.searchParams.set('mediaType', filters.mediaType!);
			if (filters.search) apiUrl.searchParams.set('search', filters.search);
			if (filters.protocol !== 'all') apiUrl.searchParams.set('protocol', filters.protocol!);
			if (filters.indexer) apiUrl.searchParams.set('indexer', filters.indexer);
			if (filters.releaseGroup) apiUrl.searchParams.set('releaseGroup', filters.releaseGroup);
			if (filters.resolution) apiUrl.searchParams.set('resolution', filters.resolution);
			if (filters.isUpgrade) apiUrl.searchParams.set('isUpgrade', 'true');
			if (filters.includeNoResults) apiUrl.searchParams.set('includeNoResults', 'true');
			if (filters.downloadClientId)
				apiUrl.searchParams.set('downloadClientId', filters.downloadClientId);
			if (filters.startDate) apiUrl.searchParams.set('startDate', filters.startDate);
			if (filters.endDate) apiUrl.searchParams.set('endDate', filters.endDate);

			const response = await fetch(apiUrl.toString());
			const result = await response.json();

			if (result.success && result.activities) {
				activities = sortActivitiesList([...activities, ...result.activities]);
			}
		} catch (error) {
			console.error('Failed to load more:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	// Open detail modal
	async function openDetailModal(activity: UnifiedActivity) {
		selectedActivity = activity;
		isModalOpen = true;
		detailsLoading = true;
		activityDetails = null;

		// Fetch activity details
		try {
			const response = await fetch(`/api/activity/${activity.id}/details`);
			if (response.ok) {
				const data = await response.json();
				activityDetails = data.details;
			}
		} catch (error) {
			console.error('Failed to fetch activity details:', error);
		}

		detailsLoading = false;
	}

	function closeModal() {
		isModalOpen = false;
		selectedActivity = null;
		activityDetails = null;
	}

	function applyQueueStatusLocally(id: string, status: ActivityStatus, statusReason?: string) {
		for (const activity of activities) {
			if (activity.queueItemId === id) {
				activity.status = status;
				if (statusReason !== undefined) {
					activity.statusReason = statusReason;
				}
			}
		}
		if (selectedActivity?.queueItemId === id) {
			selectedActivity.status = status;
			if (statusReason !== undefined) {
				selectedActivity.statusReason = statusReason;
			}
			selectedActivity = { ...selectedActivity };
		}
	}

	async function getQueueActionErrorMessage(response: Response, fallback: string): Promise<string> {
		let message = fallback;
		try {
			const payload = await response.json();
			if (payload?.message && typeof payload.message === 'string') {
				message = payload.message;
			} else if (payload?.error && typeof payload.error === 'string') {
				message = payload.error;
			}
		} catch {
			// Ignore JSON parse errors and fall back to default message.
		}
		return message;
	}

	async function runQueueAction(id: string, action: 'pause' | 'resume') {
		const response = await fetch(`/api/queue/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action })
		});
		if (!response.ok) {
			const message = await getQueueActionErrorMessage(response, `Failed to ${action}`);
			throw new Error(message);
		}
		applyQueueStatusLocally(id, action === 'pause' ? 'paused' : 'downloading');
	}

	async function removeQueueItem(
		id: string,
		options: { refresh?: boolean; closeDetailModal?: boolean } = {}
	): Promise<void> {
		const { refresh = true, closeDetailModal = true } = options;
		const response = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
		if (!response.ok) {
			const message = await getQueueActionErrorMessage(response, 'Failed to remove');
			throw new Error(message);
		}

		if (refresh) {
			await refreshActivityData({ force: true });
		}
		if (closeDetailModal) {
			closeModal();
		}
	}

	async function retryQueueItem(id: string, options: { refresh?: boolean } = {}): Promise<void> {
		const { refresh = true } = options;
		const response = await fetch(`/api/queue/${id}/retry`, { method: 'POST' });
		if (!response.ok) {
			const message = await getQueueActionErrorMessage(response, 'Failed to retry');
			throw new Error(message);
		}

		const payload = await response.json().catch(() => null);
		const retryMode = typeof payload?.retryMode === 'string' ? payload.retryMode : 'download';
		const importStatus = typeof payload?.importStatus === 'string' ? payload.importStatus : null;
		if (retryMode === 'import') {
			const reason =
				importStatus === 'pending_retry'
					? 'Waiting for download path before import retry'
					: 'Import retry in progress';
			applyQueueStatusLocally(id, 'downloading', reason);
			scheduleQueueStatsRefresh(250, { force: true });
		} else {
			applyQueueStatusLocally(id, 'downloading');
		}

		if (refresh && retryMode !== 'import') {
			await refreshActivityData({ force: true });
		}
	}

	// Queue actions
	async function handlePause(id: string) {
		await runQueueAction(id, 'pause');
	}

	async function handleResume(id: string) {
		await runQueueAction(id, 'resume');
	}

	async function handleRemove(id: string) {
		await removeQueueItem(id);
	}

	async function handleRetry(id: string) {
		await retryQueueItem(id);
	}
</script>

<svelte:head>
	<title>Activity - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="flex items-center gap-2 text-2xl font-bold">
				<Activity class="h-8 w-8" />
				Activity
			</h1>
			<p class="text-base-content/70">Download and search history</p>
		</div>
		<!-- Connection Status -->
		<div class="hidden lg:block">
			{#if sse.isConnected}
				<span class="badge gap-1 badge-success">
					<Wifi class="h-3 w-3" />
					Live
				</span>
			{:else if sse.status === 'connecting' || sse.status === 'error'}
				<span class="badge gap-1 {sse.status === 'error' ? 'badge-error' : 'badge-warning'}">
					<Loader2 class="h-3 w-3 animate-spin" />
					{sse.status === 'error' ? 'Reconnecting...' : 'Connecting...'}
				</span>
			{:else}
				<span class="badge gap-1 badge-ghost">
					<WifiOff class="h-3 w-3" />
					Disconnected
				</span>
			{/if}
		</div>
	</div>

	<div class="tabs-boxed tabs w-fit">
		<button
			class="tab {activityTab === 'active' ? 'tab-active' : ''}"
			onclick={() => switchTab('active')}
		>
			Active Downloads
		</button>
		<button
			class="tab {activityTab === 'history' ? 'tab-active' : ''}"
			onclick={() => switchTab('history')}
		>
			History
		</button>
	</div>

	{#if activityTab === 'active'}
		<div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
			<button
				type="button"
				class="min-h-26 rounded-xl border p-3 text-left transition-colors sm:p-4 {isQueueCardFilterActive(
					'all'
				)
					? 'border-primary/80 bg-base-200'
					: 'border-base-300 bg-base-200 hover:border-base-content/25'}"
				onclick={() => applyQueueCardFilter('all')}
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-base-content/70 sm:text-sm">Total</span>
					<Activity class="h-4 w-4 text-base-content/50" />
				</div>
				<div class="text-2xl font-bold">
					{queueStats.totalCount}
				</div>
			</button>

			<button
				type="button"
				class="min-h-26 rounded-xl border p-3 text-left transition-colors sm:p-4 {isQueueCardFilterActive(
					'downloading'
				)
					? 'border-primary/80 bg-base-200'
					: 'border-base-300 bg-base-200 hover:border-base-content/25'}"
				onclick={() => applyQueueCardFilter('downloading')}
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-base-content/70 sm:text-sm">Downloading</span>
					<Download class="h-4 w-4 text-info" />
				</div>
				<div class="text-2xl font-bold">
					{queueStats.downloadingCount}
				</div>
			</button>

			<button
				type="button"
				class="min-h-26 rounded-xl border p-3 text-left transition-colors sm:p-4 {isQueueCardFilterActive(
					'seeding'
				)
					? 'border-primary/80 bg-base-200'
					: 'border-base-300 bg-base-200 hover:border-base-content/25'}"
				onclick={() => applyQueueCardFilter('seeding')}
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-base-content/70 sm:text-sm">Seeding</span>
					<Upload class="h-4 w-4 text-success" />
				</div>
				<div class="text-2xl font-bold">
					{queueStats.seedingCount}
				</div>
			</button>

			<button
				type="button"
				class="min-h-26 rounded-xl border p-3 text-left transition-colors sm:p-4 {isQueueCardFilterActive(
					'paused'
				)
					? 'border-primary/80 bg-base-200'
					: 'border-base-300 bg-base-200 hover:border-base-content/25'}"
				onclick={() => applyQueueCardFilter('paused')}
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-base-content/70 sm:text-sm">Paused</span>
					<Pause class="h-4 w-4 text-warning" />
				</div>
				<div class="text-2xl font-bold">
					{queueStats.pausedCount}
				</div>
			</button>

			<button
				type="button"
				class="min-h-26 rounded-xl border p-3 text-left transition-colors sm:p-4 {isQueueCardFilterActive(
					'failed'
				)
					? 'border-primary/80 bg-base-200'
					: 'border-base-300 bg-base-200 hover:border-base-content/25'}"
				onclick={() => applyQueueCardFilter('failed')}
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-base-content/70 sm:text-sm">Failed</span>
					<AlertTriangle class="h-4 w-4 text-error" />
				</div>
				<div class="text-2xl font-bold">
					{queueStats.failedCount}
				</div>
			</button>

			<div class="min-h-26 rounded-xl border border-base-300 bg-base-200 p-3 sm:p-4">
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-base-content/70 sm:text-sm">Speed</span>
					<Gauge class="h-4 w-4 text-info" />
				</div>
				<div class="mt-2 space-y-1 text-sm font-bold sm:text-lg">
					<div class="flex items-center gap-2 text-info">
						<ArrowDown class="h-5 w-5 shrink-0" aria-hidden="true" />
						<span>{queueDownloadSpeedLabel}</span>
					</div>
					<div class="flex items-center gap-2 text-success">
						<ArrowUp class="h-5 w-5 shrink-0" aria-hidden="true" />
						<span>{queueUploadSpeedLabel}</span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Unified Toolbar -->
	<ActivityFilters
		{filters}
		filterOptions={data.filterOptions}
		statusContext={activityTab}
		onFiltersChange={applyFilters}
		onClearFilters={clearAllFilters}
		showActiveFilters={true}
		showHistoryControls={canManageHistory && activityTab === 'history'}
	>
		{#snippet activeFiltersContent()}
			<ActiveFilters
				{filters}
				downloadClients={data.filterOptions.downloadClients}
				onFilterRemove={removeFilter}
				onClearAll={clearAllFilters}
			/>
			{#if activityTab === 'active'}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<span class="text-sm font-bold tracking-wide text-base-content/70"
						>Queue Bulk Actions</span
					>
					<div class="divider m-0 divider-horizontal h-6"></div>
					<button class="btn btn-ghost btn-xs" onclick={toggleActiveSelectionMode}>
						{activeSelectionMode ? 'Exit Selection' : 'Select Rows'}
					</button>

					{#if activeSelectionMode}
						<span class="text-xs text-base-content/60">{selectedActiveIds.length} selected</span>
						<button
							class="btn btn-xs"
							onclick={() => openActiveConfirm('pause')}
							disabled={activeBulkLoading || selectedPausableQueueIds.length === 0}
						>
							Pause ({selectedPausableQueueIds.length})
						</button>
						<button
							class="btn btn-xs"
							onclick={() => openActiveConfirm('resume')}
							disabled={activeBulkLoading || selectedPausedQueueIds.length === 0}
						>
							Resume ({selectedPausedQueueIds.length})
						</button>
						<button
							class="btn btn-xs btn-warning"
							onclick={() => openActiveConfirm('retry_failed')}
							disabled={activeBulkLoading || selectedFailedQueueIds.length === 0}
						>
							Retry Failed ({selectedFailedQueueIds.length})
						</button>
						<button
							class="btn btn-xs btn-error"
							onclick={() => openActiveConfirm('remove_failed')}
							disabled={activeBulkLoading || selectedFailedQueueIds.length === 0}
						>
							Remove Failed ({selectedFailedQueueIds.length})
						</button>
						<div class="ml-auto"></div>
						<button
							class="btn btn-ghost btn-xs"
							onclick={() => {
								selectedActiveIds = [];
							}}
							disabled={activeBulkLoading || selectedActiveIds.length === 0}
						>
							Clear Selection
						</button>
					{:else}
						<span class="text-xs text-base-content/60">
							Select queue rows to bulk pause, resume, retry failed, or remove failed downloads.
						</span>
					{/if}
				</div>
			{/if}
		{/snippet}

		{#snippet historyControlsContent()}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-sm font-bold tracking-wide text-base-content/70">History Management</span>
				<div class="divider m-0 divider-horizontal h-6"></div>
				<label class="flex items-center gap-2 text-sm">
					<span class="text-base-content/70">Retention:</span>
					<select
						class="select-bordered select select-xs"
						bind:value={retentionDays}
						disabled={settingsLoading}
					>
						<option value={7}>7 days</option>
						<option value={14}>14 days</option>
						<option value={30}>30 days</option>
						<option value={60}>60 days</option>
						<option value={90}>90 days</option>
					</select>
				</label>
				<div class="divider m-0 divider-horizontal h-6"></div>
				<button
					class="btn btn-xs"
					onclick={saveRetention}
					disabled={settingsLoading || saveRetentionLoading}
				>
					{#if saveRetentionLoading}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Save
				</button>
				<button
					class="btn btn-xs"
					onclick={() => openHistoryConfirm('purge_older_than_retention')}
					disabled={settingsLoading || purgeOlderLoading}
				>
					{#if purgeOlderLoading}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Purge Older
				</button>
				<button class="btn btn-ghost btn-xs" onclick={toggleSelectionMode}>
					{selectionMode ? 'Exit Selection' : 'Select Rows'}
				</button>
				{#if selectionMode}
					<button
						class="btn btn-xs btn-error"
						onclick={() => openHistoryConfirm('delete_selected')}
						disabled={deleteSelectedLoading || selectedHistoryIds.length === 0}
					>
						{#if deleteSelectedLoading}
							<Loader2 class="h-3 w-3 animate-spin" />
						{/if}
						Delete Selected ({selectedHistoryIds.length})
					</button>
				{/if}
				<div class="ml-auto"></div>
				<button
					class="btn btn-xs btn-error"
					onclick={() => openHistoryConfirm('purge_all')}
					disabled={settingsLoading || purgeAllLoading}
				>
					{#if purgeAllLoading}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Purge All
				</button>
			</div>
		{/snippet}
	</ActivityFilters>

	<!-- Activity Stats -->
	<div class="flex items-center gap-4 text-sm text-base-content/70">
		<span>{total} {activityTab === 'active' ? 'active downloads' : 'history activities'}</span>
		{#if activityTab === 'active' && activities.some((a) => a.status === 'downloading')}
			<span class="badge gap-1 badge-info">
				<Loader2 class="h-3 w-3 animate-spin" />
				{activities.filter((a) => a.status === 'downloading').length} downloading
			</span>
		{/if}
	</div>

	<!-- Activity Table -->
	{#if isLoading && activities.length === 0}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin" />
		</div>
	{:else}
		<ActivityTable
			{activities}
			{sortField}
			{sortDirection}
			selectionMode={activityTab === 'history' ? selectionMode : activeSelectionMode}
			selectedIds={activityTab === 'history' ? selectedHistoryIds : selectedActiveIds}
			isSelectable={activityTab === 'history' ? isHistoryActivity : isActiveQueueActivity}
			onSort={handleSort}
			onRowClick={openDetailModal}
			onPause={handlePause}
			onResume={handleResume}
			onRemove={handleRemove}
			onRetry={handleRetry}
			onToggleSelection={activityTab === 'history'
				? handleToggleSelection
				: handleToggleActiveSelection}
			onToggleSelectionAll={activityTab === 'history'
				? handleToggleSelectionAll
				: handleToggleActiveSelectionAll}
		/>

		<!-- Load More -->
		{#if data.hasMore}
			<div class="flex justify-center py-4">
				<button class="btn btn-ghost" onclick={loadMore} disabled={isLoadingMore}>
					{#if isLoadingMore}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Load More
				</button>
			</div>
		{/if}
	{/if}
</div>

<ConfirmationModal
	open={historyConfirmOpen}
	title={historyConfirmTitle}
	message={historyConfirmMessage}
	confirmLabel={historyConfirmLabel}
	confirmVariant="error"
	loading={historyConfirmLoading}
	onConfirm={handleHistoryConfirm}
	onCancel={closeHistoryConfirm}
/>

<ConfirmationModal
	open={activeConfirmOpen}
	title={activeConfirmTitle}
	message={activeConfirmMessage}
	confirmLabel={activeConfirmLabel}
	confirmVariant={activeConfirmVariant}
	loading={activeBulkLoading}
	onConfirm={handleActiveConfirm}
	onCancel={closeActiveConfirm}
/>

<!-- Detail Modal -->
{#if isModalOpen && selectedActivity}
	<ActivityDetailModal
		activity={selectedActivity}
		details={activityDetails}
		loading={detailsLoading}
		onClose={closeModal}
		onPause={handlePause}
		onResume={handleResume}
		onRemove={handleRemove}
		onRetry={handleRetry}
	/>
{/if}
