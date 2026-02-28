<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { resolvePath } from '$lib/utils/routing';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import { toasts } from '$lib/stores/toast.svelte';
	import {
		ArrowUp,
		Check,
		ChevronRight,
		Clapperboard,
		FileVideo,
		Folder,
		Home,
		Loader2,
		Search,
		Sparkles,
		Tv,
		X
	} from 'lucide-svelte';

	type MediaType = 'movie' | 'tv';

	interface BrowseEntry {
		name: string;
		path: string;
		isDirectory: boolean;
		size?: number;
	}

	interface RootFolder {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		isDefault?: boolean;
		readOnly?: boolean;
	}

	interface MatchResult {
		tmdbId: number;
		title: string;
		year?: number;
		mediaType: MediaType;
		confidence: number;
		inLibrary: boolean;
		libraryId?: string;
		rootFolderId?: string | null;
		rootFolderPath?: string | null;
	}

	interface DetectionGroup {
		id: string;
		displayName: string;
		sourceType: 'file' | 'folder';
		sourcePath: string;
		selectedFilePath: string;
		fileName: string;
		detectedFileCount: number;
		detectedSeasons?: number[];
		suggestedSeason?: number;
		parsedTitle: string;
		parsedYear?: number;
		parsedSeason?: number;
		parsedEpisode?: number;
		inferredMediaType: MediaType;
		matches: MatchResult[];
	}

	interface DetectionResult extends DetectionGroup {
		grouped: boolean;
		totalGroups: number;
		selectedGroupId: string;
		groups: DetectionGroup[];
	}

	interface GroupReviewState {
		selectedMediaType: MediaType;
		selectedMatch: MatchResult | null;
		searchQuery: string;
		matchCandidates: MatchResult[];
		importTarget: 'new' | 'existing';
		seasonNumber: number;
		episodeNumber: number;
		batchSeasonOverride: number | null;
		selectedRootFolder: string;
	}

	interface ExecuteResult {
		success: boolean;
		mediaType: MediaType;
		tmdbId: number;
		libraryId: string;
		importedPath: string;
		importedCount?: number;
		importedPaths?: string[];
	}

	interface ImportRouteContext {
		mediaType: MediaType;
		tmdbId: number;
		libraryId: string | null;
		title: string | null;
		year: number | null;
	}

	interface PendingNavigation {
		href: string;
		external: boolean;
	}

	type QueueMediaFilter = 'all' | MediaType;

	interface DetectionSection {
		id: string;
		label: string;
		mediaType: MediaType;
		items: DetectionGroup[];
		seasonSections?: TvSeasonSection[];
	}

	interface TvSeasonSection {
		key: string;
		label: string;
		seasonNumber: number | null;
		items: DetectionGroup[];
	}

	type WizardStep = 1 | 2 | 3 | 4;

	let step = $state<WizardStep>(1);
	let preferredMediaType = $state<'auto' | MediaType>('auto');

	let sourcePath = $state('/');
	let browserPath = $state('/');
	let browserEntries = $state<BrowseEntry[]>([]);
	let browserParentPath = $state<string | null>(null);
	let browserLoading = $state(false);
	let browserError = $state<string | null>(null);

	let rootFolders = $state<RootFolder[]>([]);
	let loadingRootFolders = $state(true);

	let detecting = $state(false);
	let detection = $state<DetectionResult | null>(null);
	let selectedGroupId = $state<string | null>(null);
	let importedGroupIds = $state<string[]>([]);
	let skippedGroupIds = $state<string[]>([]);
	let showSelectedItemEditor = $state(false);
	let groupReviewState = $state<Record<string, GroupReviewState>>({});
	let detectedGroupQuery = $state('');
	let detectedGroupFilter = $state<'all' | 'pending' | 'ready' | 'imported' | 'skipped'>('pending');
	let detectedMediaFilter = $state<QueueMediaFilter>('all');
	let importMediaFilter = $state<QueueMediaFilter>('all');
	let reviewSelectedSeriesSectionId = $state<string | null>(null);
	let reviewSelectedSeasonSectionKey = $state<string | null>(null);
	let importSelectedSeriesSectionId = $state<string | null>(null);
	let importSelectedSeasonSectionKey = $state<string | null>(null);
	let tmdbSearchDebounce: ReturnType<typeof setTimeout> | null = null;

	let selectedMediaType = $state<MediaType>('movie');
	let selectedMatch = $state<MatchResult | null>(null);
	let searchQuery = $state('');
	let searchingMatches = $state(false);
	let matchCandidates = $state<MatchResult[]>([]);
	let importTarget = $state<'new' | 'existing'>('new');

	let seasonNumber = $state(1);
	let episodeNumber = $state(1);
	let batchSeasonOverride = $state<number | null>(null);
	let selectedRootFolder = $state('');
	let executingImport = $state(false);
	let executeResult = $state<ExecuteResult | null>(null);
	let executeError = $state<string | null>(null);
	let bulkImportSummary = $state<{ importedGroups: number; failedGroups: number } | null>(null);
	let bypassNavigationGuard = false;
	let leaveImportModalOpen = $state(false);
	let pendingNavigation = $state<PendingNavigation | null>(null);
	let lastNewSessionToken = $state<string | null>(null);
	const routeImportContext = $derived.by(() => parseImportContext($page.url.searchParams));
	const isDirectLibraryImportContext = $derived.by(() => Boolean(routeImportContext?.libraryId));
	const isMediaTypeLockedByContext = $derived.by(() => Boolean(routeImportContext));
	const isFileOnlyContext = $derived.by(() =>
		Boolean(
			routeImportContext && routeImportContext.mediaType === 'movie' && routeImportContext.libraryId
		)
	);

	const detectionGroups = $derived.by(() => {
		if (!detection) return [];
		if (Array.isArray(detection.groups) && detection.groups.length > 0) {
			return detection.groups;
		}
		return [toDetectionGroup(detection)];
	});

	const activeGroup = $derived.by(() => {
		if (detectionGroups.length === 0) return null;
		if (!selectedGroupId) return detectionGroups[0];
		return detectionGroups.find((group) => group.id === selectedGroupId) ?? detectionGroups[0];
	});
	const isSingleFileSelection = $derived.by(() =>
		Boolean(activeGroup && detectionGroups.length === 1 && activeGroup.sourceType === 'file')
	);
	const skipActionsEnabled = $derived.by(() => !isSingleFileSelection);
	const selectedMatchContextMismatch = $derived.by(() => {
		const context = routeImportContext;
		if (!context || !selectedMatch) {
			return false;
		}
		return selectedMatch.mediaType === context.mediaType && selectedMatch.tmdbId !== context.tmdbId;
	});
	const parsedSourceContextMismatch = $derived.by(() => {
		const context = routeImportContext;
		const group = activeGroup;
		if (!context || !group || !context.title) {
			return false;
		}

		const normalizedParsedTitle = normalizeTitleForComparison(group.parsedTitle || '');
		const normalizedContextTitle = normalizeTitleForComparison(context.title);
		if (!normalizedParsedTitle || !normalizedContextTitle) {
			return false;
		}

		if (normalizedParsedTitle !== normalizedContextTitle) {
			return true;
		}

		if (context.year && group.parsedYear && Math.abs(context.year - group.parsedYear) > 1) {
			return true;
		}

		return false;
	});

	const isActiveGroupImported = $derived.by(() =>
		Boolean(activeGroup && importedGroupIds.includes(activeGroup.id))
	);
	const step2Ready = $derived(Boolean(activeGroup && selectedMatch && !isActiveGroupImported));
	const rootFoldersForType = $derived(
		rootFolders.filter((folder) => folder.mediaType === selectedMediaType && !folder.readOnly)
	);
	const isBatchTvImport = $derived(
		Boolean(activeGroup && selectedMediaType === 'tv' && activeGroup.detectedFileCount > 1)
	);
	const remainingGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) => !importedGroupIds.includes(group.id) && !skippedGroupIds.includes(group.id)
			).length
	);
	const pendingGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) =>
					!importedGroupIds.includes(group.id) &&
					!skippedGroupIds.includes(group.id) &&
					!canImportGroup(group)
			).length
	);
	const skippedGroupCount = $derived.by(
		() => detectionGroups.filter((group) => skippedGroupIds.includes(group.id)).length
	);
	const readyGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) =>
					!importedGroupIds.includes(group.id) &&
					!skippedGroupIds.includes(group.id) &&
					canImportGroup(group)
			).length
	);
	const isMultiGroupReview = $derived(detectionGroups.length > 1);
	const selectedImportGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) => !importedGroupIds.includes(group.id) && !skippedGroupIds.includes(group.id)
			).length
	);
	const selectedNeedsInputCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) =>
					!importedGroupIds.includes(group.id) &&
					!skippedGroupIds.includes(group.id) &&
					!canImportGroup(group)
			).length
	);
	const canProceedFromReview = $derived.by(() => {
		if (isMultiGroupReview) {
			return selectedImportGroupCount > 0;
		}
		return step2Ready && !isGroupSkipped(activeGroup?.id ?? '');
	});
	const filteredDetectionGroups = $derived.by(() => {
		const query = detectedGroupQuery.trim().toLowerCase();

		const filtered = detectionGroups.filter((group) => {
			const isImported = importedGroupIds.includes(group.id);
			const isSkipped = skippedGroupIds.includes(group.id);
			const isRemaining = !isImported && !isSkipped;
			const isReady = isRemaining && canImportGroup(group);
			const isPending = isRemaining && !isReady;

			if (detectedGroupFilter === 'imported' && !isImported) return false;
			if (detectedGroupFilter === 'skipped' && !isSkipped) return false;
			if (detectedGroupFilter === 'pending' && !isPending) return false;
			if (detectedGroupFilter === 'ready' && !isReady) return false;

			if (!query) return true;

			return (
				group.displayName.toLowerCase().includes(query) ||
				group.sourcePath.toLowerCase().includes(query) ||
				group.parsedTitle.toLowerCase().includes(query)
			);
		});

		return filtered.sort((a, b) => {
			if (selectedGroupId === a.id) return -1;
			if (selectedGroupId === b.id) return 1;
			return a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
		});
	});
	const filteredDetectionGroupsByMedia = $derived.by(() =>
		filteredDetectionGroups.filter((group) => {
			if (detectedMediaFilter === 'all') {
				return true;
			}
			return getEffectiveMediaType(group) === detectedMediaFilter;
		})
	);
	const reviewDetectionSections = $derived.by(() =>
		buildDetectionSections(filteredDetectionGroupsByMedia)
	);
	const selectedImportGroups = $derived.by(() =>
		detectionGroups.filter((group) => !isGroupImported(group.id) && !isGroupSkipped(group.id))
	);
	const selectedImportGroupsByMedia = $derived.by(() =>
		selectedImportGroups.filter((group) => {
			if (importMediaFilter === 'all') {
				return true;
			}
			return getEffectiveMediaType(group) === importMediaFilter;
		})
	);
	const importSelectionSections = $derived.by(() =>
		buildDetectionSections(selectedImportGroupsByMedia)
	);
	const reviewMovieSections = $derived.by(() =>
		reviewDetectionSections.filter((section) => section.mediaType === 'movie')
	);
	const reviewTvSections = $derived.by(() =>
		reviewDetectionSections.filter((section) => section.mediaType === 'tv')
	);
	const activeReviewTvSection = $derived.by(() => {
		if (reviewTvSections.length === 0) return null;
		if (!reviewSelectedSeriesSectionId) return reviewTvSections[0];
		return (
			reviewTvSections.find((section) => section.id === reviewSelectedSeriesSectionId) ??
			reviewTvSections[0]
		);
	});
	const activeReviewSeasonSection = $derived.by(() => {
		if (!activeReviewTvSection?.seasonSections || activeReviewTvSection.seasonSections.length === 0)
			return null;
		if (!reviewSelectedSeasonSectionKey) {
			return activeReviewTvSection.seasonSections[0];
		}
		return (
			activeReviewTvSection.seasonSections.find(
				(seasonSection) => seasonSection.key === reviewSelectedSeasonSectionKey
			) ?? activeReviewTvSection.seasonSections[0]
		);
	});
	const hasMultipleReviewTvSeries = $derived.by(() => reviewTvSections.length > 1);

	const importMovieSections = $derived.by(() =>
		importSelectionSections.filter((section) => section.mediaType === 'movie')
	);
	const importTvSections = $derived.by(() =>
		importSelectionSections.filter((section) => section.mediaType === 'tv')
	);
	const activeImportTvSection = $derived.by(() => {
		if (importTvSections.length === 0) return null;
		if (!importSelectedSeriesSectionId) return importTvSections[0];
		return (
			importTvSections.find((section) => section.id === importSelectedSeriesSectionId) ??
			importTvSections[0]
		);
	});
	const activeImportSeasonSection = $derived.by(() => {
		if (!activeImportTvSection?.seasonSections || activeImportTvSection.seasonSections.length === 0)
			return null;
		if (!importSelectedSeasonSectionKey) {
			return activeImportTvSection.seasonSections[0];
		}
		return (
			activeImportTvSection.seasonSections.find(
				(seasonSection) => seasonSection.key === importSelectedSeasonSectionKey
			) ?? activeImportTvSection.seasonSections[0]
		);
	});
	const hasMultipleImportTvSeries = $derived.by(() => importTvSections.length > 1);

	const canProceedToImport = $derived.by(() => {
		if (
			!selectedMatch ||
			!activeGroup ||
			isActiveGroupImported ||
			skippedGroupIds.includes(activeGroup.id)
		)
			return false;
		if (!isBatchTvImport && selectedMediaType === 'tv' && (seasonNumber < 0 || episodeNumber < 1))
			return false;
		if (selectedMatch.inLibrary && importTarget !== 'existing') return false;

		if (importTarget === 'existing') {
			return selectedMatch.inLibrary;
		}

		if (rootFoldersForType.length === 0) return false;
		if (rootFoldersForType.length === 1) return true;
		return selectedRootFolder.length > 0;
	});
	const hasActiveImportSession = $derived.by(
		() => Boolean(detection) && (step === 2 || step === 3 || executingImport)
	);

	beforeNavigate((navigation) => {
		if (bypassNavigationGuard || !hasActiveImportSession) {
			return;
		}
		if (navigation.willUnload) {
			return;
		}

		const destinationUrl = navigation.to?.url;
		if (destinationUrl && destinationUrl.href === $page.url.href) {
			return;
		}

		if (destinationUrl) {
			pendingNavigation = {
				href: destinationUrl.href,
				external: destinationUrl.origin !== window.location.origin
			};
			leaveImportModalOpen = true;
		}
		navigation.cancel();
	});

	$effect(() => {
		loadRootFolders();
		browse('/');
	});

	$effect(() => {
		const context = routeImportContext;
		if (!context) return;
		if (preferredMediaType !== context.mediaType) {
			preferredMediaType = context.mediaType;
		}
	});

	$effect(() => {
		const newSessionToken = $page.url.searchParams.get('newSession');
		if (!newSessionToken || newSessionToken === lastNewSessionToken) {
			return;
		}
		lastNewSessionToken = newSessionToken;
		resetWizard();
	});

	$effect(() => {
		let nextRootFolder = selectedRootFolder;
		if (rootFoldersForType.length === 1) {
			nextRootFolder = rootFoldersForType[0].id;
		} else if (!rootFoldersForType.some((folder) => folder.id === selectedRootFolder)) {
			nextRootFolder = '';
		}

		if (nextRootFolder !== selectedRootFolder) {
			selectedRootFolder = nextRootFolder;
		}
	});

	$effect(() => {
		if (!selectedMatch) {
			return;
		}

		const nextImportTarget = selectedMatch.inLibrary
			? 'existing'
			: importTarget === 'existing'
				? 'new'
				: importTarget;
		if (nextImportTarget !== importTarget) {
			importTarget = nextImportTarget;
			persistActiveGroupState();
		}
	});

	$effect(() => {
		if (step !== 2) {
			return;
		}
		if (reviewTvSections.length === 0) {
			reviewSelectedSeriesSectionId = null;
			reviewSelectedSeasonSectionKey = null;
			return;
		}

		if (!reviewTvSections.some((section) => section.id === reviewSelectedSeriesSectionId)) {
			reviewSelectedSeriesSectionId = reviewTvSections[0].id;
			reviewSelectedSeasonSectionKey = null;
		}
	});

	$effect(() => {
		if (step !== 2) {
			return;
		}
		const activeSection = activeReviewTvSection;
		if (
			!activeSection ||
			!activeSection.seasonSections ||
			activeSection.seasonSections.length === 0
		) {
			reviewSelectedSeasonSectionKey = null;
			return;
		}
		if (
			!reviewSelectedSeasonSectionKey ||
			!activeSection.seasonSections.some(
				(seasonSection) => seasonSection.key === reviewSelectedSeasonSectionKey
			)
		) {
			reviewSelectedSeasonSectionKey = activeSection.seasonSections[0].key;
		}
	});

	$effect(() => {
		if (step !== 3) {
			return;
		}
		if (importTvSections.length === 0) {
			importSelectedSeriesSectionId = null;
			importSelectedSeasonSectionKey = null;
			return;
		}
		if (!importTvSections.some((section) => section.id === importSelectedSeriesSectionId)) {
			importSelectedSeriesSectionId = importTvSections[0].id;
			importSelectedSeasonSectionKey = null;
		}
	});

	$effect(() => {
		if (step !== 3) {
			return;
		}
		const activeSection = activeImportTvSection;
		if (
			!activeSection ||
			!activeSection.seasonSections ||
			activeSection.seasonSections.length === 0
		) {
			importSelectedSeasonSectionKey = null;
			return;
		}
		if (
			!importSelectedSeasonSectionKey ||
			!activeSection.seasonSections.some(
				(seasonSection) => seasonSection.key === importSelectedSeasonSectionKey
			)
		) {
			importSelectedSeasonSectionKey = activeSection.seasonSections[0].key;
		}
	});

	$effect(() => {
		if (step !== 2) {
			return;
		}
		if (detectedGroupFilter !== 'pending') {
			return;
		}
		if (pendingGroupCount === 0 && readyGroupCount > 0) {
			detectedGroupFilter = 'ready';
		}
	});

	async function loadRootFolders() {
		loadingRootFolders = true;
		try {
			const response = await fetch('/api/root-folders');
			const payload = await readResponsePayload<RootFolder[] | { folders?: RootFolder[] }>(
				response
			);
			if (!response.ok) {
				throw new Error(getResponseErrorMessage(payload, 'Failed to load root folders'));
			}
			if (Array.isArray(payload)) {
				rootFolders = payload;
			} else if (payload && typeof payload === 'object') {
				rootFolders = payload.folders ?? [];
			} else {
				rootFolders = [];
			}
		} catch {
			toasts.error('Failed to load root folders');
		} finally {
			loadingRootFolders = false;
		}
	}

	async function browse(path?: string) {
		browserLoading = true;
		browserError = null;
		try {
			const query = new URLSearchParams({
				includeFiles: 'true',
				fileFilter: 'video',
				excludeManagedRoots: 'true',
				...(path ? { path } : {})
			});
			const response = await fetch(`/api/filesystem/browse?${query.toString()}`);
			const payload = await readResponsePayload<{
				currentPath?: string;
				parentPath?: string | null;
				entries?: BrowseEntry[];
				error?: string;
			}>(response);
			if (!response.ok) {
				browserError = getResponseErrorMessage(payload, 'Failed to browse path');
				return;
			}
			if (!payload || typeof payload !== 'object') {
				browserError = 'Invalid response from filesystem browser';
				return;
			}
			if (payload.error) {
				browserError = payload.error;
			}
			browserPath = payload.currentPath ?? path ?? '';
			if (!sourcePath && payload.currentPath) {
				sourcePath = payload.currentPath;
			}
			browserParentPath = payload.parentPath ?? null;
			browserEntries = payload.entries ?? [];
		} catch (error) {
			browserError = error instanceof Error ? error.message : 'Failed to browse path';
		} finally {
			browserLoading = false;
		}
	}

	function formatSize(bytes?: number) {
		if (!bytes) return '';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) {
			return `${gb.toFixed(2)} GB`;
		}
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}

	function parseImportContext(searchParams: URLSearchParams): ImportRouteContext | null {
		const mediaType = searchParams.get('mediaType');
		if (mediaType !== 'movie' && mediaType !== 'tv') {
			return null;
		}

		const tmdbIdRaw = searchParams.get('tmdbId');
		const tmdbId = tmdbIdRaw ? Number.parseInt(tmdbIdRaw, 10) : Number.NaN;
		if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
			return null;
		}

		const libraryIdValue = searchParams.get('libraryId');
		const titleValue = searchParams.get('title');
		const yearRaw = searchParams.get('year');
		let parsedYear: number | null = null;
		if (yearRaw) {
			const year = Number.parseInt(yearRaw, 10);
			if (Number.isFinite(year) && year > 0) {
				parsedYear = year;
			}
		}

		return {
			mediaType,
			tmdbId,
			libraryId: libraryIdValue?.trim() || null,
			title: titleValue?.trim() || null,
			year: parsedYear
		};
	}

	function buildRouteContextMatch(group: DetectionGroup): MatchResult | null {
		const context = routeImportContext;
		if (!context) return null;

		return {
			tmdbId: context.tmdbId,
			title: context.title || group.parsedTitle || group.displayName,
			year: context.year ?? group.parsedYear,
			mediaType: context.mediaType,
			confidence: 1,
			inLibrary: Boolean(context.libraryId),
			libraryId: context.libraryId ?? undefined
		} satisfies MatchResult;
	}

	function toDetectionGroup(result: DetectionResult): DetectionGroup {
		return {
			id: result.id || result.sourcePath,
			displayName: result.displayName || result.fileName,
			sourceType: result.sourceType || 'file',
			sourcePath: result.sourcePath,
			selectedFilePath: result.selectedFilePath,
			fileName: result.fileName,
			detectedFileCount: result.detectedFileCount,
			detectedSeasons: result.detectedSeasons,
			suggestedSeason: result.suggestedSeason,
			parsedTitle: result.parsedTitle,
			parsedYear: result.parsedYear,
			parsedSeason: result.parsedSeason,
			parsedEpisode: result.parsedEpisode,
			inferredMediaType: result.inferredMediaType,
			matches: result.matches ?? []
		};
	}

	function createInitialGroupState(group: DetectionGroup): GroupReviewState {
		const initialCandidates = group.matches ?? [];
		const initialMatch = initialCandidates[0] ?? null;
		return {
			selectedMediaType: group.inferredMediaType,
			selectedMatch: initialMatch,
			searchQuery: group.parsedTitle,
			matchCandidates: initialCandidates,
			importTarget: initialMatch?.inLibrary ? 'existing' : 'new',
			seasonNumber: group.parsedSeason ?? 1,
			episodeNumber: group.parsedEpisode ?? 1,
			batchSeasonOverride: group.suggestedSeason ?? null,
			selectedRootFolder: ''
		};
	}

	function loadGroupState(groupId: string) {
		const existing = groupReviewState[groupId];
		const group = detectionGroups.find((item) => item.id === groupId);
		const state = existing ?? (group ? createInitialGroupState(group) : null);
		if (!state) return;

		if (!existing) {
			groupReviewState = {
				...groupReviewState,
				[groupId]: state
			};
		}

		selectedMediaType = state.selectedMediaType;
		selectedMatch = state.selectedMatch;
		searchQuery = state.searchQuery;
		matchCandidates = state.matchCandidates;
		importTarget = state.importTarget;
		seasonNumber = state.seasonNumber;
		episodeNumber = state.episodeNumber;
		batchSeasonOverride = state.batchSeasonOverride;
		selectedRootFolder = state.selectedRootFolder;
	}

	function persistActiveGroupState() {
		if (!selectedGroupId) return;
		groupReviewState = {
			...groupReviewState,
			[selectedGroupId]: {
				selectedMediaType,
				selectedMatch,
				searchQuery,
				matchCandidates,
				importTarget,
				seasonNumber,
				episodeNumber,
				batchSeasonOverride,
				selectedRootFolder
			}
		};
	}

	function shouldPreserveSelectedItemEditor(nextGroupId: string): boolean {
		if (!showSelectedItemEditor || !isMultiGroupReview || step !== 2) {
			return false;
		}

		const nextGroup = detectionGroups.find((group) => group.id === nextGroupId);
		if (!nextGroup) {
			return false;
		}

		return getEffectiveMediaType(nextGroup) === 'tv';
	}

	function switchGroup(groupId: string) {
		if (groupId === selectedGroupId) return;
		const preserveSelectedItemEditor = shouldPreserveSelectedItemEditor(groupId);
		persistActiveGroupState();
		selectedGroupId = groupId;
		loadGroupState(groupId);
		if (isMultiGroupReview && !preserveSelectedItemEditor) {
			showSelectedItemEditor = false;
		}
	}

	function markGroupImported(groupId: string) {
		if (importedGroupIds.includes(groupId)) return;
		importedGroupIds = [...importedGroupIds, groupId];
		skippedGroupIds = skippedGroupIds.filter((id) => id !== groupId);
	}

	function markGroupSkipped(groupId: string) {
		if (!skipActionsEnabled) return;
		if (importedGroupIds.includes(groupId)) return;
		if (skippedGroupIds.includes(groupId)) return;
		skippedGroupIds = [...skippedGroupIds, groupId];
	}

	function unskipGroup(groupId: string) {
		if (!skippedGroupIds.includes(groupId)) return;
		skippedGroupIds = skippedGroupIds.filter((id) => id !== groupId);
	}

	function toggleSkipActiveGroup() {
		if (!skipActionsEnabled) return;
		if (!activeGroup) return;
		if (skippedGroupIds.includes(activeGroup.id)) {
			unskipGroup(activeGroup.id);
			return;
		}
		markGroupSkipped(activeGroup.id);
	}

	function continueWithNextDetected() {
		const nextGroup = detectionGroups.find(
			(group) => !importedGroupIds.includes(group.id) && !skippedGroupIds.includes(group.id)
		);
		if (!nextGroup) {
			resetWizard();
			return;
		}
		switchGroup(nextGroup.id);
		step = 2;
	}

	function getWritableRootFoldersForType(mediaType: MediaType): RootFolder[] {
		return rootFolders.filter((folder) => folder.mediaType === mediaType && !folder.readOnly);
	}

	function isGroupImported(groupId: string): boolean {
		return importedGroupIds.includes(groupId);
	}

	function isGroupSkipped(groupId: string): boolean {
		return skippedGroupIds.includes(groupId);
	}

	function isGroupPending(groupId: string): boolean {
		return !isGroupImported(groupId) && !isGroupSkipped(groupId);
	}

	function getGroupState(group: DetectionGroup): GroupReviewState {
		return groupReviewState[group.id] ?? createInitialGroupState(group);
	}

	function getEffectiveMediaType(group: DetectionGroup): MediaType {
		return getGroupState(group).selectedMediaType;
	}

	function buildDetectionSections(groups: DetectionGroup[]): DetectionSection[] {
		const sections: DetectionSection[] = [];
		const tvSectionIndex: Record<string, number> = {};

		for (const group of groups) {
			const mediaType = getEffectiveMediaType(group);
			if (mediaType === 'movie') {
				sections.push({
					id: `movie:${group.id}`,
					label: group.displayName,
					mediaType: 'movie',
					items: [group]
				});
				continue;
			}

			const key = getTvSeriesSectionKey(group);
			const existingIndex = tvSectionIndex[key];
			if (existingIndex === undefined) {
				const section: DetectionSection = {
					id: key,
					label: getTvSeriesSectionLabel(group),
					mediaType: 'tv',
					items: [],
					seasonSections: []
				};
				sections.push(section);
				tvSectionIndex[key] = sections.length - 1;
			} else {
				sections[existingIndex].items.push(group);
				continue;
			}
			sections[tvSectionIndex[key]].items.push(group);
		}

		for (const section of sections) {
			section.items.sort((a, b) =>
				a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
			);
			if (section.mediaType === 'tv') {
				section.seasonSections = buildTvSeasonSections(section.items);
			}
		}

		return sections;
	}

	function getTvSeriesSectionKey(group: DetectionGroup): string {
		const state = getGroupState(group);
		const match = state.selectedMatch;
		if (match && match.mediaType === 'tv') {
			return `tv:tmdb:${match.tmdbId}`;
		}
		const normalizedParsedTitle = normalizeGroupingKey(group.parsedTitle || group.displayName);
		const year = group.parsedYear ? `:${group.parsedYear}` : '';
		return `tv:parsed:${normalizedParsedTitle}${year}`;
	}

	function getTvSeriesSectionLabel(group: DetectionGroup): string {
		const state = getGroupState(group);
		const match = state.selectedMatch;
		if (match && match.mediaType === 'tv') {
			return match.year ? `${match.title} (${match.year})` : match.title;
		}
		const parsedTitle = group.parsedTitle?.trim();
		if (parsedTitle) {
			return group.parsedYear ? `${parsedTitle} (${group.parsedYear})` : parsedTitle;
		}
		return 'Unmatched TV Series';
	}

	function normalizeGroupingKey(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim()
			.replace(/\s+/g, '-');
	}

	function normalizeTitleForComparison(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
			.replace(/^(?:the|an|a)/, '');
	}

	function buildTvSeasonSections(items: DetectionGroup[]): TvSeasonSection[] {
		const sectionIndex: Record<string, number> = {};
		const sections: TvSeasonSection[] = [];

		for (const group of items) {
			const seasonNumber = getGroupSeasonNumber(group);
			const key = seasonNumber === null ? 'unknown' : `s${seasonNumber}`;
			const existingIndex = sectionIndex[key];

			if (existingIndex === undefined) {
				sections.push({
					key,
					label: seasonNumber === null ? 'Season Unmapped' : `Season ${seasonNumber}`,
					seasonNumber,
					items: [group]
				});
				sectionIndex[key] = sections.length - 1;
				continue;
			}

			sections[existingIndex].items.push(group);
		}

		for (const section of sections) {
			section.items.sort((a, b) =>
				a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
			);
		}

		return sections.sort((a, b) => {
			if (a.seasonNumber === null && b.seasonNumber === null) return 0;
			if (a.seasonNumber === null) return 1;
			if (b.seasonNumber === null) return -1;
			return a.seasonNumber - b.seasonNumber;
		});
	}

	function getGroupSeasonNumber(group: DetectionGroup): number | null {
		if (typeof group.parsedSeason === 'number') {
			return group.parsedSeason;
		}
		const state = getGroupState(group);
		if (typeof state.batchSeasonOverride === 'number') {
			return state.batchSeasonOverride;
		}
		if (typeof group.suggestedSeason === 'number') {
			return group.suggestedSeason;
		}
		return null;
	}

	function getDetectedSeasonsLabel(section: DetectionSection): string {
		if (
			section.mediaType !== 'tv' ||
			!section.seasonSections ||
			section.seasonSections.length === 0
		) {
			return 'none';
		}
		const seasons = section.seasonSections
			.filter((season) => season.seasonNumber !== null)
			.map((season) => season.seasonNumber as number);
		if (seasons.length === 0) {
			return 'none';
		}
		return seasons.join(', ');
	}

	function hasUnknownSeasonItems(section: DetectionSection): boolean {
		if (section.mediaType !== 'tv' || !section.seasonSections) {
			return false;
		}
		return section.seasonSections.some((season) => season.seasonNumber === null);
	}

	function getSectionSeasonOverride(section: DetectionSection): number | null {
		if (section.mediaType !== 'tv') {
			return null;
		}
		for (const group of section.items) {
			const override = getGroupState(group).batchSeasonOverride;
			if (typeof override === 'number') {
				return override;
			}
		}
		return null;
	}

	function applySeasonOverrideToSection(section: DetectionSection, seasonNumber: number | null) {
		if (section.mediaType !== 'tv') return;
		const nextState = { ...groupReviewState };
		for (const group of section.items) {
			const state = getGroupState(group);
			const nextSeason =
				seasonNumber !== null && group.parsedSeason === undefined
					? seasonNumber
					: state.seasonNumber;
			nextState[group.id] = {
				...state,
				seasonNumber: nextSeason,
				batchSeasonOverride: seasonNumber
			};
		}
		groupReviewState = nextState;

		if (activeGroup && section.items.some((group) => group.id === activeGroup.id)) {
			loadGroupState(activeGroup.id);
		}
	}

	function handleSectionSeasonOverrideChange(section: DetectionSection, event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value.trim();
		if (!value) {
			applySeasonOverrideToSection(section, null);
			return;
		}
		const parsed = parseInt(value, 10);
		if (isNaN(parsed) || parsed < 0) {
			return;
		}
		applySeasonOverrideToSection(section, parsed);
	}

	function selectReviewSeriesSection(sectionId: string) {
		if (reviewSelectedSeriesSectionId === sectionId) {
			return;
		}
		reviewSelectedSeriesSectionId = sectionId;
		reviewSelectedSeasonSectionKey = null;
	}

	function selectReviewSeasonSection(seasonKey: string) {
		reviewSelectedSeasonSectionKey = seasonKey;
	}

	function getSkippableSeasonGroups(
		seasonSection: TvSeasonSection | null | undefined
	): DetectionGroup[] {
		if (!seasonSection) return [];
		return seasonSection.items.filter((group) => !isGroupImported(group.id));
	}

	function isSeasonSectionFullySkipped(seasonSection: TvSeasonSection | null | undefined): boolean {
		const groups = getSkippableSeasonGroups(seasonSection);
		return groups.length > 0 && groups.every((group) => isGroupSkipped(group.id));
	}

	function getSeasonSectionSkippedCount(seasonSection: TvSeasonSection | null | undefined): number {
		return getSkippableSeasonGroups(seasonSection).filter((group) => isGroupSkipped(group.id))
			.length;
	}

	function toggleSeasonSectionSkipped(seasonSection: TvSeasonSection | null | undefined) {
		if (!skipActionsEnabled || !seasonSection) return;

		const groups = getSkippableSeasonGroups(seasonSection);
		if (groups.length === 0) return;

		if (isSeasonSectionFullySkipped(seasonSection)) {
			const groupIds = groups.map((group) => group.id);
			skippedGroupIds = skippedGroupIds.filter((groupId) => !groupIds.includes(groupId));
			return;
		}

		const nextSkippedIds = [...skippedGroupIds];
		for (const group of groups) {
			if (!nextSkippedIds.includes(group.id)) {
				nextSkippedIds.push(group.id);
			}
		}
		skippedGroupIds = nextSkippedIds;
	}

	function selectImportSeriesSection(sectionId: string) {
		if (importSelectedSeriesSectionId === sectionId) {
			return;
		}
		importSelectedSeriesSectionId = sectionId;
		importSelectedSeasonSectionKey = null;
	}

	function selectImportSeasonSection(seasonKey: string) {
		importSelectedSeasonSectionKey = seasonKey;
	}

	function canImportGroup(group: DetectionGroup): boolean {
		if (importedGroupIds.includes(group.id) || skippedGroupIds.includes(group.id)) {
			return false;
		}

		const state = getGroupState(group);
		const match = state.selectedMatch;
		if (!match) {
			return false;
		}
		if (match.inLibrary && state.importTarget !== 'existing') {
			return false;
		}

		const isBatchTv = state.selectedMediaType === 'tv' && group.detectedFileCount > 1;
		if (
			!isBatchTv &&
			state.selectedMediaType === 'tv' &&
			(state.seasonNumber < 0 || state.episodeNumber < 1)
		) {
			return false;
		}

		if (state.importTarget === 'existing') {
			return match.inLibrary;
		}

		const folders = getWritableRootFoldersForType(state.selectedMediaType);
		if (folders.length === 0) return false;
		if (folders.length === 1) return true;
		return state.selectedRootFolder.length > 0;
	}

	function findDefaultReviewGroupId(
		groups: DetectionGroup[],
		preferredGroupId: string | null
	): string | null {
		if (groups.length === 0) return null;

		const firstNeedsInput = groups.find((group) => !canImportGroup(group));
		if (firstNeedsInput) {
			return firstNeedsInput.id;
		}

		if (preferredGroupId && groups.some((group) => group.id === preferredGroupId)) {
			return preferredGroupId;
		}

		return groups[0].id;
	}

	function buildImportPayload(group: DetectionGroup) {
		const state = getGroupState(group);
		if (!state.selectedMatch) {
			throw new Error(`No match selected for "${group.displayName}"`);
		}
		const resolvedImportTarget = state.selectedMatch.inLibrary ? 'existing' : state.importTarget;

		const foldersForType = getWritableRootFoldersForType(state.selectedMediaType);
		const isBatchTv = state.selectedMediaType === 'tv' && group.detectedFileCount > 1;

		return {
			sourcePath: group.sourcePath,
			mediaType: state.selectedMediaType,
			tmdbId: state.selectedMatch.tmdbId,
			importTarget: resolvedImportTarget,
			...(resolvedImportTarget === 'new'
				? { rootFolderId: state.selectedRootFolder || foldersForType[0]?.id }
				: {}),
			...(state.selectedMediaType === 'tv' && !isBatchTv
				? { seasonNumber: state.seasonNumber, episodeNumber: state.episodeNumber }
				: {}),
			...(state.selectedMediaType === 'tv' && isBatchTv && state.batchSeasonOverride !== null
				? { seasonNumber: state.batchSeasonOverride }
				: {})
		};
	}

	async function executeImportRequest(payload: Record<string, unknown>): Promise<ExecuteResult> {
		const response = await fetch('/api/library/import/execute', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await response.json();
		if (!response.ok || !data.success) {
			throw new Error(data.error || 'Import failed');
		}
		return data.data as ExecuteResult;
	}

	function clearMatchSearch() {
		if (!activeGroup) return;
		searchQuery = '';
		const state = getGroupState(activeGroup);
		matchCandidates =
			state.matchCandidates.length > 0 ? state.matchCandidates : activeGroup.matches;
		if (selectedMatch && !matchCandidates.some((match) => match.tmdbId === selectedMatch?.tmdbId)) {
			selectedMatch = matchCandidates[0] ?? null;
		}
		persistActiveGroupState();
	}

	function handleMatchSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value.replace(/^\s+/, '');
		persistActiveGroupState();

		if (tmdbSearchDebounce) {
			clearTimeout(tmdbSearchDebounce);
		}

		if (searchQuery.trim().length < 2) {
			if (activeGroup) {
				matchCandidates = activeGroup.matches ?? [];
				if (matchCandidates.length > 0) {
					selectedMatch = matchCandidates[0] ?? selectedMatch;
				}
				persistActiveGroupState();
			}
			return;
		}

		tmdbSearchDebounce = setTimeout(() => {
			searchTmdb();
		}, 300);
	}

	async function runDetection() {
		if (!sourcePath.trim()) {
			toasts.error('Please select a source path');
			return;
		}

		detecting = true;
		try {
			const response = await fetch('/api/library/import/detect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourcePath,
					...(preferredMediaType !== 'auto' ? { mediaType: preferredMediaType } : {}),
					...(isFileOnlyContext ? { requireFile: true } : {})
				})
			});
			const data = await response.json();
			if (!response.ok || !data.success) {
				throw new Error(data.error || 'Failed to detect media');
			}

			const detectedData = data.data as DetectionResult;
			executeResult = null;
			bulkImportSummary = null;
			importedGroupIds = [];
			skippedGroupIds = [];
			detectedGroupQuery = '';
			detectedGroupFilter = 'pending';
			detectedMediaFilter = 'all';
			importMediaFilter = 'all';
			showSelectedItemEditor = false;
			reviewSelectedSeriesSectionId = null;
			reviewSelectedSeasonSectionKey = null;
			importSelectedSeriesSectionId = null;
			importSelectedSeasonSectionKey = null;
			if (tmdbSearchDebounce) {
				clearTimeout(tmdbSearchDebounce);
				tmdbSearchDebounce = null;
			}

			const groups =
				Array.isArray(detectedData.groups) && detectedData.groups.length > 0
					? detectedData.groups
					: [toDetectionGroup(detectedData)];

			const nextGroupState: Record<string, GroupReviewState> = {};
			for (const group of groups) {
				const state = createInitialGroupState(group);
				const contextMatch = buildRouteContextMatch(group);
				if (contextMatch) {
					const mergedMatches = [
						contextMatch,
						...state.matchCandidates.filter(
							(match) =>
								!(
									match.mediaType === contextMatch.mediaType && match.tmdbId === contextMatch.tmdbId
								)
						)
					];
					group.matches = mergedMatches;
					state.selectedMediaType = contextMatch.mediaType;
					state.matchCandidates = mergedMatches;
					state.selectedMatch = contextMatch;
					state.searchQuery = contextMatch.title;
					state.importTarget = contextMatch.inLibrary ? 'existing' : 'new';
				}
				nextGroupState[group.id] = state;
			}
			detection = {
				...detectedData,
				groups,
				totalGroups: groups.length
			};
			groupReviewState = nextGroupState;
			const hasNeedsInputGroups = groups.some((group) => !canImportGroup(group));
			detectedGroupFilter = hasNeedsInputGroups ? 'pending' : 'ready';

			const preferredGroupId =
				detectedData.selectedGroupId &&
				groups.some((group) => group.id === detectedData.selectedGroupId)
					? detectedData.selectedGroupId
					: null;
			const nextSelectedGroupId = findDefaultReviewGroupId(groups, preferredGroupId);
			selectedGroupId = nextSelectedGroupId;
			if (nextSelectedGroupId) {
				loadGroupState(nextSelectedGroupId);
			}
			step = 2;
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Detection failed');
		} finally {
			detecting = false;
		}
	}

	async function searchTmdb() {
		if (routeImportContext) {
			return;
		}
		const currentGroup = activeGroup;
		if (!currentGroup) return;
		if (tmdbSearchDebounce) {
			clearTimeout(tmdbSearchDebounce);
			tmdbSearchDebounce = null;
		}

		if (!searchQuery.trim()) {
			toasts.error('Enter a title to search');
			return;
		}

		searchingMatches = true;
		try {
			const searchResponse = await fetch(
				`/api/discover/search?query=${encodeURIComponent(searchQuery)}&type=${selectedMediaType}`
			);
			const searchData = await searchResponse.json();
			const results = searchData.results ?? [];

			const tmdbIds = results.map((item: { id: number }) => item.id);
			const statusResponse = await fetch('/api/library/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tmdbIds,
					mediaType: selectedMediaType
				})
			});
			const statusData = await statusResponse.json();
			const statusMap = statusData.status ?? {};

			matchCandidates = results.map((item: Record<string, unknown>) => {
				const tmdbId = item.id as number;
				const date = (item.release_date || item.first_air_date) as string | undefined;
				const year = date ? parseInt(date.split('-')[0], 10) : undefined;
				const status = statusMap[tmdbId];
				return {
					tmdbId,
					title: (item.title || item.name || 'Unknown') as string,
					year,
					mediaType: selectedMediaType,
					confidence: 0,
					inLibrary: Boolean(status?.inLibrary),
					libraryId: status?.libraryId
				} satisfies MatchResult;
			});

			if (matchCandidates.length === 0) {
				toasts.warning('No matches found');
			}
		} catch {
			toasts.error('Failed to search TMDB');
		} finally {
			persistActiveGroupState();
			searchingMatches = false;
		}
	}

	function chooseMatch(match: MatchResult) {
		selectedMatch = match;
		importTarget = match.inLibrary ? 'existing' : 'new';
		persistActiveGroupState();
	}

	function switchMediaType(nextType: MediaType) {
		if (routeImportContext) {
			return;
		}
		if (selectedMediaType === nextType) return;
		selectedMediaType = nextType;
		selectedMatch = null;
		matchCandidates = [];
		importTarget = 'new';
		batchSeasonOverride = nextType === 'tv' ? (activeGroup?.suggestedSeason ?? null) : null;
		persistActiveGroupState();
	}

	function goToStep(targetStep: WizardStep) {
		persistActiveGroupState();
		if (targetStep === 3) {
			if (isMultiGroupReview) {
				if (selectedImportGroupCount === 0) return;
			} else if (!step2Ready) {
				return;
			}
		}
		step = targetStep;
	}

	function resetWizard() {
		preferredMediaType = routeImportContext?.mediaType ?? 'auto';
		sourcePath = '/';
		browserPath = '/';
		browserParentPath = null;
		browserEntries = [];
		browserError = null;
		step = 1;
		detection = null;
		selectedMatch = null;
		selectedMediaType = routeImportContext?.mediaType ?? 'movie';
		matchCandidates = [];
		searchQuery = '';
		seasonNumber = 1;
		episodeNumber = 1;
		batchSeasonOverride = null;
		executeResult = null;
		executeError = null;
		bulkImportSummary = null;
		importTarget = 'new';
		selectedGroupId = null;
		importedGroupIds = [];
		skippedGroupIds = [];
		groupReviewState = {};
		selectedRootFolder = '';
		detectedGroupQuery = '';
		detectedGroupFilter = 'pending';
		detectedMediaFilter = 'all';
		importMediaFilter = 'all';
		showSelectedItemEditor = false;
		reviewSelectedSeriesSectionId = null;
		reviewSelectedSeasonSectionKey = null;
		importSelectedSeriesSectionId = null;
		importSelectedSeasonSectionKey = null;
		if (tmdbSearchDebounce) {
			clearTimeout(tmdbSearchDebounce);
			tmdbSearchDebounce = null;
		}
		void browse('/');
	}

	async function executeImportFlow() {
		const currentGroup = activeGroup;
		if (!currentGroup || !selectedMatch) return;
		if (!canProceedToImport) return;
		persistActiveGroupState();

		executingImport = true;
		executeError = null;
		try {
			const payload = buildImportPayload(currentGroup);
			const result = await executeImportRequest(payload);
			executeResult = result;
			bulkImportSummary = null;
			if (selectedGroupId) {
				markGroupImported(selectedGroupId);
			}
			if (isDirectLibraryImportContext && originLibraryLink) {
				toasts.success('Import complete');
				bypassNavigationGuard = true;
				await goto(originLibraryLink);
				return;
			}
			step = 4;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Import failed';
			if (isDirectLibraryImportContext) {
				executeError = message;
				step = 4;
			} else {
				toasts.error(message);
			}
		} finally {
			executingImport = false;
		}
	}

	async function executeBulkImportFlow() {
		if (selectedImportGroupCount === 0) {
			toasts.warning('No selected items to import');
			return;
		}

		if (selectedNeedsInputCount > 0) {
			toasts.warning('Some selected items still need input before import');
			return;
		}

		persistActiveGroupState();
		executingImport = true;
		let imported = 0;
		let failed = 0;
		let lastSuccess: ExecuteResult | null = null;
		const failures: string[] = [];

		try {
			for (const group of detectionGroups) {
				if (importedGroupIds.includes(group.id)) {
					continue;
				}
				if (skippedGroupIds.includes(group.id)) {
					continue;
				}
				if (!canImportGroup(group)) {
					continue;
				}

				try {
					const payload = buildImportPayload(group);
					lastSuccess = await executeImportRequest(payload);
					markGroupImported(group.id);
					imported++;
				} catch (error) {
					failed++;
					failures.push(
						`${group.displayName}: ${error instanceof Error ? error.message : 'Import failed'}`
					);
				}
			}
		} finally {
			executingImport = false;
		}

		if (imported === 0) {
			toasts.error(failures[0] ?? 'No groups were imported');
			return;
		}

		executeResult = lastSuccess;
		bulkImportSummary = { importedGroups: imported, failedGroups: failed };
		step = 4;

		if (failed > 0) {
			toasts.warning(`Imported ${imported} group(s), failed ${failed}.`);
			toasts.error(failures[0]);
		} else {
			toasts.success(`Imported ${imported} group(s).`);
		}
	}

	const completionLink = $derived.by(() => {
		if (!executeResult) return null;
		const path =
			executeResult.mediaType === 'movie'
				? `/library/movie/${executeResult.libraryId}`
				: `/library/tv/${executeResult.libraryId}`;
		return resolvePath(path);
	});
	const originLibraryLink = $derived.by(() => {
		if (!routeImportContext?.libraryId) return null;
		const path =
			routeImportContext.mediaType === 'movie'
				? `/library/movie/${routeImportContext.libraryId}`
				: `/library/tv/${routeImportContext.libraryId}`;
		return resolvePath(path);
	});

	function formatMediaTypeLabel(mediaType: MediaType): string {
		return mediaType === 'movie' ? 'Movie' : 'TV Show';
	}

	function closeLeaveImportModal() {
		leaveImportModalOpen = false;
		pendingNavigation = null;
	}

	async function confirmLeaveImportModal() {
		const destination = pendingNavigation;
		if (!destination) {
			closeLeaveImportModal();
			return;
		}

		leaveImportModalOpen = false;
		pendingNavigation = null;
		bypassNavigationGuard = true;

		if (destination.external) {
			window.location.assign(destination.href);
			return;
		}

		await goto(destination.href);
	}
</script>

<svelte:head>
	<title>Import Media - Library - Cinephage</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-5">
	<div class="flex flex-col gap-2">
		<h1 class="text-3xl font-bold">Import Media</h1>
		<p class="text-base-content/70">Browse local files, review TMDB matches, and import.</p>
	</div>

	<ul class="steps w-full">
		<li class="step {step >= 1 ? 'step-primary' : ''}">Select Path</li>
		<li class="step {step >= 2 ? 'step-primary' : ''}">Review Matches</li>
		<li class="step {step >= 3 ? 'step-primary' : ''}">Import</li>
		<li class="step {step >= 4 ? 'step-primary' : ''}">Complete</li>
	</ul>

	{#if step === 1}
		<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
			<div class="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start">
				<label class="form-control">
					<span class="label-text text-sm font-medium">Media Type</span>
					<select
						class="select-bordered select w-full"
						bind:value={preferredMediaType}
						disabled={isMediaTypeLockedByContext}
					>
						<option value="auto">Auto Detect</option>
						<option value="movie">Movie</option>
						<option value="tv">TV</option>
					</select>
				</label>

				<label class="form-control">
					<span class="label-text text-sm font-medium">Source Path</span>
					<span class="text-xs text-base-content/60 md:col-span-2 md:col-start-2">
						{#if isFileOnlyContext}
							Select the media file to import for this movie.
						{:else}
							Select the path to your media file or folder.
						{/if}</span
					>
					<input
						class="input-bordered input w-full"
						placeholder="/path/to/file-or-folder"
						bind:value={sourcePath}
					/>
				</label>

				<div class="md:self-end">
					<span class="label-text invisible hidden text-sm font-medium md:block">Detect</span>
					<button
						type="button"
						class="btn w-full btn-primary md:w-auto"
						onclick={runDetection}
						disabled={detecting}
					>
						{#if detecting}
							<Loader2 class="h-4 w-4 animate-spin" />
							Detecting
						{:else}
							<Sparkles class="h-4 w-4" />
							Detect Media
						{/if}
					</button>
				</div>
			</div>

			<div class="mt-4 overflow-hidden rounded-lg border border-base-300">
				<div class="flex items-center gap-2 border-b border-base-300 bg-base-200 p-3">
					<button
						type="button"
						class="btn btn-square btn-ghost btn-sm"
						onclick={() => browse('/')}
						title="Go to /"
					>
						<Home class="h-4 w-4" />
					</button>
					<button
						class="btn btn-square btn-ghost btn-sm"
						disabled={!browserParentPath}
						onclick={() => browserParentPath && browse(browserParentPath)}
					>
						<ArrowUp class="h-4 w-4" />
					</button>
					<div class="min-w-0 flex-1 truncate rounded bg-base-100 px-2 py-1 font-mono text-sm">
						{browserPath}
					</div>
					{#if !isFileOnlyContext}
						<button class="btn btn-outline btn-xs" onclick={() => (sourcePath = browserPath)}>
							Use Folder
						</button>
					{/if}
				</div>

				<div class="max-h-80 overflow-y-auto p-2">
					{#if browserLoading}
						<div class="flex items-center justify-center py-8">
							<Loader2 class="h-5 w-5 animate-spin text-base-content/60" />
						</div>
					{:else if browserError}
						<div class="alert text-sm alert-error">
							<span>{browserError}</span>
						</div>
					{:else if browserEntries.length === 0}
						<div class="py-6 text-center text-sm text-base-content/60">
							No folders or media files found
						</div>
					{:else}
						<div class="space-y-1">
							{#each browserEntries as entry (entry.path)}
								<button
									type="button"
									class="flex w-full items-center gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-base-200"
									onclick={() =>
										entry.isDirectory ? browse(entry.path) : (sourcePath = entry.path)}
								>
									{#if entry.isDirectory}
										<Folder class="h-4 w-4 shrink-0 text-warning" />
									{:else}
										<FileVideo class="h-4 w-4 shrink-0 text-info" />
									{/if}
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm font-medium">{entry.name}</div>
										{#if !entry.isDirectory}
											<div class="text-xs text-base-content/60">{formatSize(entry.size)}</div>
										{/if}
									</div>
									{#if sourcePath === entry.path}
										<Check class="h-4 w-4 text-success" />
									{/if}
									{#if entry.isDirectory}
										<ChevronRight class="h-4 w-4 text-base-content/40" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if step === 2 && detection && activeGroup}
		<div class="space-y-4">
			{#if detectionGroups.length > 1}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 class="text-lg font-semibold">Detected Items</h2>
							<p class="mt-1 text-sm text-base-content/70">
								Review and select items from this queue for import.
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2 text-xs">
							<span class="badge badge-outline">{pendingGroupCount} needs input</span>
							<span class="badge badge-primary">{remainingGroupCount} selected</span>
							<span class="badge badge-success">{importedGroupIds.length} imported</span>
							{#if skippedGroupCount > 0}
								<span class="badge badge-ghost">{skippedGroupCount} skipped</span>
							{/if}
						</div>
					</div>

					<div class="mt-3 flex flex-col gap-2 lg:flex-row">
						<div class="group relative flex-1">
							<div class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
								<Search
									class="h-4 w-4 text-base-content/40 transition-colors group-focus-within:text-primary"
								/>
							</div>
							<input
								type="text"
								placeholder="Search detected items..."
								class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
								bind:value={detectedGroupQuery}
							/>
							{#if detectedGroupQuery}
								<button
									class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
									onclick={() => (detectedGroupQuery = '')}
									aria-label="Clear detected item search"
								>
									<X class="h-3.5 w-3.5" />
								</button>
							{/if}
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<div class="join">
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'pending'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'pending')}
								>
									Needs Input
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'ready'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'ready')}
								>
									Ready
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'skipped'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'skipped')}
								>
									Skipped
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'imported'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'imported')}
								>
									Imported
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'all'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'all')}
								>
									All
								</button>
							</div>
							<div class="join">
								<button
									type="button"
									class="btn join-item btn-sm {detectedMediaFilter === 'all'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedMediaFilter = 'all')}
								>
									All Media
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedMediaFilter === 'movie'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedMediaFilter = 'movie')}
								>
									Movies
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedMediaFilter === 'tv'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedMediaFilter = 'tv')}
								>
									TV Shows
								</button>
							</div>
						</div>
					</div>

					<div class="mt-3 space-y-3">
						{#if reviewDetectionSections.length === 0}
							<div
								class="rounded-lg border border-dashed border-base-300 p-4 text-center text-sm text-base-content/60"
							>
								No detected items match this filter.
							</div>
						{:else}
							{#if reviewMovieSections.length > 0}
								<div class="max-h-72 space-y-2 overflow-y-auto pr-1">
									{#each reviewMovieSections as section (section.id)}
										{#each section.items as group (group.id)}
											<div class="rounded-lg border border-base-300 p-2">
												<div
													class="flex items-center gap-2 rounded-lg border p-2 sm:p-3 {selectedGroupId ===
													group.id
														? 'border-primary bg-primary/5'
														: 'border-base-300'}"
												>
													<button
														type="button"
														class="min-w-0 flex-1 text-left"
														onclick={() => switchGroup(group.id)}
													>
														<div class="truncate text-sm font-medium sm:text-base">
															{group.displayName}
														</div>
														<div
															class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
														>
															<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
															<span>•</span>
															<span
																>{group.detectedFileCount} file{group.detectedFileCount === 1
																	? ''
																	: 's'}</span
															>
															{#if canImportGroup(group)}
																<span class="text-success">Ready</span>
															{:else if isGroupPending(group.id)}
																<span class="text-warning">Needs input</span>
															{/if}
														</div>
													</button>
													<div class="flex shrink-0 items-center gap-2">
														{#if isGroupImported(group.id)}
															<span class="badge badge-sm badge-success">Imported</span>
														{:else if isGroupSkipped(group.id)}
															<span class="badge badge-ghost badge-sm">Skipped</span>
														{/if}
														{#if !isGroupImported(group.id) && skipActionsEnabled}
															<button
																type="button"
																class="btn btn-ghost btn-xs"
																onclick={() =>
																	isGroupSkipped(group.id)
																		? unskipGroup(group.id)
																		: markGroupSkipped(group.id)}
															>
																{isGroupSkipped(group.id) ? 'Select' : 'Skip'}
															</button>
														{/if}
													</div>
												</div>
											</div>
										{/each}
									{/each}
								</div>
							{/if}

							{#if reviewTvSections.length > 0}
								<div class="overflow-hidden rounded-lg border border-base-300 p-2">
									<div
										class="grid gap-3 {hasMultipleReviewTvSeries
											? 'xl:grid-cols-[280px_minmax(0,1fr)]'
											: ''}"
									>
										{#if hasMultipleReviewTvSeries}
											<div class="max-h-80 space-y-1 overflow-y-auto pr-1">
												{#each reviewTvSections as section (section.id)}
													<button
														type="button"
														class="w-full rounded-md border px-3 py-2 text-left transition-colors {activeReviewTvSection?.id ===
														section.id
															? 'border-primary bg-primary/5'
															: 'border-base-300 hover:bg-base-200/50'}"
														onclick={() => selectReviewSeriesSection(section.id)}
													>
														<div class="truncate text-sm font-medium">{section.label}</div>
														<div class="mt-1 text-xs text-base-content/70">
															{section.items.length} episode{section.items.length === 1 ? '' : 's'} •
															seasons: {getDetectedSeasonsLabel(section)}
														</div>
													</button>
												{/each}
											</div>
										{/if}

										<div class="min-w-0 overflow-hidden rounded-md border border-base-300 p-2">
											{#if activeReviewTvSection}
												<div class="flex flex-wrap items-center justify-between gap-2">
													<div class="min-w-0">
														<div class="truncate font-medium">{activeReviewTvSection.label}</div>
														<div class="text-xs text-base-content/70">
															{activeReviewTvSection.items.length} episode{activeReviewTvSection
																.items.length === 1
																? ''
																: 's'}
														</div>
													</div>
													{#if hasUnknownSeasonItems(activeReviewTvSection)}
														<div class="flex items-center gap-2">
															<span class="text-xs text-base-content/70">Override Season</span>
															<input
																type="number"
																min="0"
																class="input-bordered input input-xs w-20"
																value={getSectionSeasonOverride(activeReviewTvSection) ?? ''}
																onchange={(event) =>
																	handleSectionSeasonOverrideChange(activeReviewTvSection, event)}
															/>
														</div>
													{/if}
												</div>

												{#if activeReviewTvSection.seasonSections}
													<div class="mt-2 flex flex-wrap gap-2">
														{#each activeReviewTvSection.seasonSections as seasonSection (seasonSection.key)}
															<button
																type="button"
																class="btn btn-xs {activeReviewSeasonSection?.key ===
																seasonSection.key
																	? 'btn-primary'
																	: 'btn-ghost'}"
																onclick={() => selectReviewSeasonSection(seasonSection.key)}
															>
																{seasonSection.label} ({seasonSection.items.length})
															</button>
														{/each}
													</div>
												{/if}
												{#if activeReviewSeasonSection && getSkippableSeasonGroups(activeReviewSeasonSection).length > 0}
													<div
														class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-base-300 bg-base-200/40 p-2"
													>
														<div class="text-xs text-base-content/70">
															{activeReviewSeasonSection.label}: {getSeasonSectionSkippedCount(
																activeReviewSeasonSection
															)} of {getSkippableSeasonGroups(activeReviewSeasonSection).length} skipped
														</div>
														<button
															type="button"
															class="btn btn-ghost btn-xs"
															onclick={() => toggleSeasonSectionSkipped(activeReviewSeasonSection)}
														>
															{isSeasonSectionFullySkipped(activeReviewSeasonSection)
																? 'Select Season'
																: 'Skip Season'}
														</button>
													</div>
												{/if}

												<div class="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
													{#each activeReviewSeasonSection?.items ?? activeReviewTvSection.items as group (group.id)}
														<div
															class="flex items-center gap-2 rounded-lg border p-2 sm:p-3 {selectedGroupId ===
															group.id
																? 'border-primary bg-primary/5'
																: 'border-base-300'}"
														>
															<button
																type="button"
																class="min-w-0 flex-1 text-left"
																onclick={() => switchGroup(group.id)}
															>
																<div class="truncate text-sm font-medium sm:text-base">
																	{group.displayName}
																</div>
																<div
																	class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
																>
																	<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
																	<span>•</span>
																	<span
																		>{group.detectedFileCount} file{group.detectedFileCount === 1
																			? ''
																			: 's'}</span
																	>
																	{#if canImportGroup(group)}
																		<span class="text-success">Ready</span>
																	{:else if isGroupPending(group.id)}
																		<span class="text-warning">Needs input</span>
																	{/if}
																</div>
															</button>
															<div class="flex shrink-0 items-center gap-2">
																{#if isGroupImported(group.id)}
																	<span class="badge badge-sm badge-success">Imported</span>
																{:else if isGroupSkipped(group.id)}
																	<span class="badge badge-ghost badge-sm">Skipped</span>
																{/if}
																{#if !isGroupImported(group.id) && skipActionsEnabled}
																	<button
																		type="button"
																		class="btn btn-ghost btn-xs"
																		onclick={() =>
																			isGroupSkipped(group.id)
																				? unskipGroup(group.id)
																				: markGroupSkipped(group.id)}
																	>
																		{isGroupSkipped(group.id) ? 'Select' : 'Skip'}
																	</button>
																{/if}
															</div>
														</div>
													{/each}
												</div>
											{/if}
										</div>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/if}

			{#if isMultiGroupReview && !showSelectedItemEditor}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="min-w-0">
							<div class="text-sm text-base-content/60">Selected Item</div>
							<div class="truncate text-lg font-semibold">{activeGroup.displayName}</div>
							<div class="text-sm text-base-content/70">
								{formatMediaTypeLabel(activeGroup.inferredMediaType)} • {activeGroup.detectedFileCount}
								file{activeGroup.detectedFileCount === 1 ? '' : 's'}
							</div>
						</div>
						<button
							class="btn btn-outline"
							onclick={() => (showSelectedItemEditor = true)}
							disabled={isGroupImported(activeGroup.id)}
						>
							Configure Selected Item
						</button>
					</div>
				</div>
			{:else}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<div class="grid gap-4 lg:grid-cols-2">
						<div class="space-y-1">
							<div class="text-sm text-base-content/60">Source</div>
							<div class="font-medium break-all">{activeGroup.sourcePath}</div>
							<div class="text-xs break-all text-base-content/60">
								Primary file: {activeGroup.selectedFilePath}
							</div>
							<div class="text-sm text-base-content/70">
								Parsed: <span class="font-medium">{activeGroup.parsedTitle}</span>
								{#if activeGroup.parsedYear}
									({activeGroup.parsedYear})
								{/if}
							</div>
							<div class="text-sm text-base-content/70">
								Files detected: <span class="font-medium">{activeGroup.detectedFileCount}</span>
								{#if activeGroup.detectedSeasons && activeGroup.detectedSeasons.length > 1}
									<span class="ml-2">Seasons: {activeGroup.detectedSeasons.join(', ')}</span>
								{/if}
							</div>
							<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
								{#if isGroupImported(activeGroup.id)}
									<span class="badge badge-sm badge-success">Imported</span>
								{:else if isGroupSkipped(activeGroup.id)}
									<span class="badge badge-ghost badge-sm">Skipped</span>
								{:else if canImportGroup(activeGroup)}
									<span class="badge badge-sm badge-primary">Ready</span>
								{:else}
									<span class="badge badge-sm badge-warning">Needs Input</span>
								{/if}
								{#if !isGroupImported(activeGroup.id) && skipActionsEnabled}
									<button class="btn btn-ghost btn-xs" onclick={toggleSkipActiveGroup}>
										{isGroupSkipped(activeGroup.id) ? 'Select Item' : 'Skip Item'}
									</button>
								{/if}
							</div>
						</div>
						<div class="space-y-2">
							<div class="text-sm text-base-content/60">Media Type</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-sm {selectedMediaType === 'movie' ? 'btn-primary' : 'btn-ghost'}"
									onclick={() => switchMediaType('movie')}
									disabled={isMediaTypeLockedByContext}
								>
									<Clapperboard class="h-4 w-4" />
									Movie
								</button>
								<button
									type="button"
									class="btn btn-sm {selectedMediaType === 'tv' ? 'btn-primary' : 'btn-ghost'}"
									onclick={() => switchMediaType('tv')}
									disabled={isMediaTypeLockedByContext}
								>
									<Tv class="h-4 w-4" />
									TV
								</button>
							</div>
							{#if isMediaTypeLockedByContext}
								<div class="text-xs text-base-content/60">
									Media type is inherited from the library item.
								</div>
							{/if}
							{#if selectedMediaType === 'tv' && !isBatchTvImport}
								<div class="grid grid-cols-2 gap-2">
									<label class="form-control">
										<span class="label-text text-xs">Season</span>
										<input
											type="number"
											min="0"
											class="input-bordered input input-sm"
											bind:value={seasonNumber}
											onchange={persistActiveGroupState}
										/>
									</label>
									<label class="form-control">
										<span class="label-text text-xs">Episode</span>
										<input
											type="number"
											min="1"
											class="input-bordered input input-sm"
											bind:value={episodeNumber}
											onchange={persistActiveGroupState}
										/>
									</label>
								</div>
							{:else if selectedMediaType === 'tv' && isBatchTvImport}
								<div class="space-y-2 rounded border border-base-300 bg-base-200/40 p-2">
									<div class="text-xs text-base-content/70">
										Episode mapping is auto-detected per file from filenames.
									</div>
									<label class="form-control">
										<span class="label-text text-xs">Season Override (optional)</span>
										<input
											type="number"
											min="0"
											class="input-bordered input input-sm"
											placeholder="Use when filenames are missing season numbers"
											bind:value={batchSeasonOverride}
											onchange={persistActiveGroupState}
										/>
										<div class="label-text-alt text-xs text-base-content/60">
											Applied only to files missing a detected season.
										</div>
									</label>
								</div>
							{/if}
							{#if isGroupImported(activeGroup.id)}
								<div class="text-xs text-success">
									This group is already imported in this session.
								</div>
							{:else if isGroupSkipped(activeGroup.id)}
								<div class="text-xs text-base-content/70">
									This item is skipped and excluded from bulk import.
								</div>
							{/if}
						</div>
						{#if parsedSourceContextMismatch && routeImportContext}
							<div class="alert text-sm alert-warning lg:col-span-2">
								<span>
									Parsed file suggests <strong
										>{activeGroup.parsedTitle}
										{#if activeGroup.parsedYear}
											({activeGroup.parsedYear})
										{/if}</strong
									>, but this import was opened for
									<strong
										>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
										{#if routeImportContext.year}
											({routeImportContext.year})
										{/if}</strong
									>.
								</span>
							</div>
						{/if}
					</div>
				</div>

				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					{#if routeImportContext}
						<div class="mb-3 alert text-sm alert-info">
							<span>
								This is a direct import for <strong
									>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
									{#if routeImportContext.year}
										({routeImportContext.year})
									{/if}</strong
								>.
							</span>
						</div>
					{:else}
						<div class="mb-3 flex items-center gap-2">
							<div class="group relative w-full">
								<div class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
									{#if searchingMatches}
										<Loader2
											class="h-4 w-4 animate-spin text-base-content/40 transition-colors group-focus-within:text-primary"
										/>
									{:else}
										<Search
											class="h-4 w-4 text-base-content/40 transition-colors group-focus-within:text-primary"
										/>
									{/if}
								</div>
								<input
									type="text"
									placeholder="Search TMDB titles..."
									class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
									value={searchQuery}
									oninput={handleMatchSearchInput}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											searchTmdb();
										}
										if (event.key === 'Escape') {
											clearMatchSearch();
										}
									}}
								/>
								{#if searchQuery}
									<button
										class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
										onclick={clearMatchSearch}
										aria-label="Clear TMDB search"
									>
										<X class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</div>
					{/if}
					{#if selectedMatchContextMismatch && routeImportContext && selectedMatch}
						<div class="mt-3 mb-3 alert text-sm alert-warning">
							<span>
								This import was opened for <strong
									>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
									{#if routeImportContext.year}
										({routeImportContext.year})
									{/if}</strong
								>, but the selected match is
								<strong
									>{selectedMatch.title}
									{#if selectedMatch.year}
										({selectedMatch.year})
									{/if}</strong
								>".
							</span>
						</div>
					{/if}

					{#if matchCandidates.length === 0}
						<div
							class="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
						>
							No matches yet. Search TMDB to continue.
						</div>
					{:else}
						<div class="max-h-80 space-y-2 overflow-y-auto pr-1">
							{#each matchCandidates as match (match.mediaType + '-' + match.tmdbId)}
								<button
									type="button"
									class="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary/50 {selectedMatch?.tmdbId ===
										match.tmdbId && selectedMatch?.mediaType === match.mediaType
										? 'border-primary bg-primary/5'
										: 'border-base-300'}"
									onclick={() => chooseMatch(match)}
								>
									<div class="min-w-0">
										<div class="truncate font-medium">
											{match.title}
											{#if match.year}
												<span class="text-base-content/60">({match.year})</span>
											{/if}
										</div>
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
											<span class="badge badge-outline badge-sm">
												{match.mediaType === 'movie' ? 'Movie' : 'TV'}
											</span>
											{#if match.confidence > 0}
												<span class="badge badge-ghost badge-sm"
													>{Math.round(match.confidence * 100)}% match</span
												>
											{/if}
											{#if match.inLibrary}
												<span class="badge badge-sm badge-success">In library</span>
											{/if}
										</div>
									</div>
									{#if selectedMatch?.tmdbId === match.tmdbId && selectedMatch?.mediaType === match.mediaType}
										<Check class="h-4 w-4 text-primary" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<button class="btn btn-ghost" onclick={() => goToStep(1)}>Back</button>
				<button
					class="btn btn-primary"
					onclick={() => goToStep(3)}
					disabled={!canProceedFromReview}
				>
					Continue to Import
				</button>
			</div>
		</div>
	{/if}

	{#if step === 3 && isMultiGroupReview && detection}
		<div class="space-y-4">
			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h2 class="text-lg font-semibold">Import Selection</h2>
				<p class="mt-1 text-sm text-base-content/70">
					Import actions run from this step. Finalize your selected items below and start import.
				</p>

				<div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
					<span class="badge badge-primary">{selectedImportGroupCount} selected</span>
					<span class="badge badge-success">{readyGroupCount} ready</span>
					{#if selectedNeedsInputCount > 0}
						<span class="badge badge-warning">{selectedNeedsInputCount} need input</span>
					{/if}
					{#if skippedGroupCount > 0}
						<span class="badge badge-ghost">{skippedGroupCount} skipped</span>
					{/if}
				</div>
			</div>

			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h3 class="font-semibold">Selected Items</h3>
				<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
					<p class="text-xs text-base-content/70">Filter selected imports by media type.</p>
					<div class="join">
						<button
							type="button"
							class="btn join-item btn-sm {importMediaFilter === 'all'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => (importMediaFilter = 'all')}
						>
							All Media
						</button>
						<button
							type="button"
							class="btn join-item btn-sm {importMediaFilter === 'movie'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => (importMediaFilter = 'movie')}
						>
							Movies
						</button>
						<button
							type="button"
							class="btn join-item btn-sm {importMediaFilter === 'tv'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => (importMediaFilter = 'tv')}
						>
							TV Shows
						</button>
					</div>
				</div>
				{#if selectedImportGroupCount === 0}
					<div
						class="mt-3 rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
					>
						No items selected for import. Go back to Review Matches and select items.
					</div>
				{:else if importSelectionSections.length === 0}
					<div
						class="mt-3 rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
					>
						No selected items match the current media filter.
					</div>
				{:else}
					<div class="mt-3 space-y-3">
						{#if importMovieSections.length > 0}
							<div class="max-h-72 space-y-2 overflow-y-auto pr-1">
								{#each importMovieSections as section (section.id)}
									{#each section.items as group (group.id)}
										<div class="rounded-lg border border-base-300 p-2">
											<div
												class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-3"
											>
												<div class="min-w-0">
													<div class="truncate font-medium">{group.displayName}</div>
													<div
														class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
													>
														<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
														<span>•</span>
														<span
															>{group.detectedFileCount} file{group.detectedFileCount === 1
																? ''
																: 's'}</span
														>
														{#if canImportGroup(group)}
															<span class="text-success">Ready</span>
														{:else}
															<span class="text-warning">Needs input</span>
														{/if}
													</div>
												</div>
												<button
													class="btn btn-ghost btn-xs"
													onclick={() => {
														switchGroup(group.id);
														step = 2;
														showSelectedItemEditor = true;
													}}
												>
													Review
												</button>
											</div>
										</div>
									{/each}
								{/each}
							</div>
						{/if}

						{#if importTvSections.length > 0}
							<div class="overflow-hidden rounded-lg border border-base-300 p-2">
								<div
									class="grid gap-3 {hasMultipleImportTvSeries
										? 'xl:grid-cols-[280px_minmax(0,1fr)]'
										: ''}"
								>
									{#if hasMultipleImportTvSeries}
										<div class="max-h-80 space-y-1 overflow-y-auto pr-1">
											{#each importTvSections as section (section.id)}
												<button
													type="button"
													class="w-full rounded-md border px-3 py-2 text-left transition-colors {activeImportTvSection?.id ===
													section.id
														? 'border-primary bg-primary/5'
														: 'border-base-300 hover:bg-base-200/50'}"
													onclick={() => selectImportSeriesSection(section.id)}
												>
													<div class="truncate text-sm font-medium">{section.label}</div>
													<div class="mt-1 text-xs text-base-content/70">
														{section.items.length} episode{section.items.length === 1 ? '' : 's'} • seasons:
														{getDetectedSeasonsLabel(section)}
													</div>
												</button>
											{/each}
										</div>
									{/if}

									<div class="min-w-0 overflow-hidden rounded-md border border-base-300 p-2">
										{#if activeImportTvSection}
											<div class="min-w-0">
												<div class="truncate font-medium">{activeImportTvSection.label}</div>
												<div class="text-xs text-base-content/70">
													{activeImportTvSection.items.length} episode{activeImportTvSection.items
														.length === 1
														? ''
														: 's'}
												</div>
											</div>

											{#if activeImportTvSection.seasonSections}
												<div class="mt-2 flex flex-wrap gap-2">
													{#each activeImportTvSection.seasonSections as seasonSection (seasonSection.key)}
														<button
															type="button"
															class="btn btn-xs {activeImportSeasonSection?.key ===
															seasonSection.key
																? 'btn-primary'
																: 'btn-ghost'}"
															onclick={() => selectImportSeasonSection(seasonSection.key)}
														>
															{seasonSection.label} ({seasonSection.items.length})
														</button>
													{/each}
												</div>
											{/if}

											<div class="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
												{#each activeImportSeasonSection?.items ?? activeImportTvSection.items as group (group.id)}
													<div
														class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-3"
													>
														<div class="min-w-0">
															<div class="truncate font-medium">{group.displayName}</div>
															<div
																class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
															>
																<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
																<span>•</span>
																<span
																	>{group.detectedFileCount} file{group.detectedFileCount === 1
																		? ''
																		: 's'}</span
																>
																{#if canImportGroup(group)}
																	<span class="text-success">Ready</span>
																{:else}
																	<span class="text-warning">Needs input</span>
																{/if}
															</div>
														</div>
														<button
															class="btn btn-ghost btn-xs"
															onclick={() => {
																switchGroup(group.id);
																step = 2;
																showSelectedItemEditor = true;
															}}
														>
															Review
														</button>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if selectedNeedsInputCount > 0}
				<div class="alert text-sm alert-warning">
					<span>
						{selectedNeedsInputCount} selected item(s) still need input. Fix them in Review Matches before
						starting import.
					</span>
				</div>
			{/if}

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<button class="btn btn-ghost" onclick={() => goToStep(2)}>Back to Review</button>
				<button
					class="btn btn-primary"
					onclick={executeBulkImportFlow}
					disabled={executingImport ||
						selectedImportGroupCount === 0 ||
						selectedNeedsInputCount > 0}
				>
					{#if executingImport}
						<Loader2 class="h-4 w-4 animate-spin" />
						Importing...
					{:else}
						<Check class="h-4 w-4" />
						Start Import ({selectedImportGroupCount})
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if step === 3 && !isMultiGroupReview && activeGroup && selectedMatch}
		<div class="space-y-4">
			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h2 class="text-lg font-semibold">Import Target</h2>
				<p class="mt-1 text-sm text-base-content/70">
					Select whether to import into an existing library item or create a new one.
				</p>
				<div class="mt-4 grid gap-2 sm:grid-cols-2">
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3 {selectedMatch.inLibrary
							? 'opacity-60'
							: ''}"
					>
						<input
							type="radio"
							name="import-target"
							class="radio mt-1 radio-primary"
							checked={importTarget === 'new'}
							onchange={() => !selectedMatch?.inLibrary && (importTarget = 'new')}
							disabled={selectedMatch?.inLibrary}
						/>
						<div>
							<div class="font-medium">Create / Import as New</div>
							<div class="text-sm text-base-content/70">
								Creates library entry if needed and imports into selected root folder.
							</div>
						</div>
					</label>
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3 {selectedMatch.inLibrary
							? ''
							: 'opacity-60'}"
					>
						<input
							type="radio"
							name="import-target"
							class="radio mt-1 radio-primary"
							checked={importTarget === 'existing'}
							onchange={() => selectedMatch?.inLibrary && (importTarget = 'existing')}
							disabled={!selectedMatch?.inLibrary}
						/>
						<div>
							<div class="font-medium">Match Existing Library Item</div>
							<div class="text-sm text-base-content/70">
								Requires selected TMDB item to already exist in library.
							</div>
						</div>
					</label>
				</div>
			</div>

			{#if importTarget === 'new'}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<h3 class="font-semibold">Destination Root Folder</h3>
					{#if loadingRootFolders}
						<div class="mt-2 flex items-center gap-2 text-sm text-base-content/70">
							<Loader2 class="h-4 w-4 animate-spin" />
							Loading folders...
						</div>
					{:else if rootFoldersForType.length === 0}
						<div class="mt-3 alert text-sm alert-warning">
							<span>No writable root folders configured for this media type.</span>
						</div>
					{:else}
						<select
							class="select-bordered select mt-3 w-full"
							bind:value={selectedRootFolder}
							onchange={persistActiveGroupState}
						>
							<option disabled value="">Select root folder</option>
							{#each rootFoldersForType as folder (folder.id)}
								<option value={folder.id}>{folder.name} - {folder.path}</option>
							{/each}
						</select>
					{/if}
				</div>
			{:else}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<h3 class="font-semibold">Existing Item Match</h3>
					<div class="mt-2 text-sm text-base-content/70">
						Importing into existing library item for:
						<span class="font-medium text-base-content">{selectedMatch.title}</span>
					</div>
				</div>
			{/if}

			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h3 class="font-semibold">Summary</h3>
				{#if selectedMatchContextMismatch && routeImportContext}
					<div class="mt-3 alert text-sm alert-warning">
						<span>
							This import was opened for <strong
								>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
								{#if routeImportContext.year}
									({routeImportContext.year})
								{/if}</strong
							>, but the selected match is
							<strong
								>{selectedMatch.title}
								{#if selectedMatch.year}
									({selectedMatch.year})
								{/if}</strong
							>.
						</span>
					</div>
				{/if}
				<div class="mt-2 space-y-1 text-sm">
					<div><span class="text-base-content/60">Source:</span> {activeGroup.sourcePath}</div>
					<div>
						<span class="text-base-content/60">Match:</span>
						{selectedMatch.title}
						{#if selectedMatch.year}
							({selectedMatch.year})
						{/if}
					</div>
					<div>
						<span class="text-base-content/60">Type:</span>
						{formatMediaTypeLabel(selectedMediaType)}
					</div>
					{#if selectedMediaType === 'tv'}
						<div>
							{#if activeGroup.detectedFileCount > 1}
								<span class="text-base-content/60">Detected Episodes:</span>
								{activeGroup.detectedFileCount} files
								{#if activeGroup.detectedSeasons && activeGroup.detectedSeasons.length > 0}
									(seasons: {activeGroup.detectedSeasons.join(', ')})
								{/if}
								{#if batchSeasonOverride !== null}
									<span class="ml-2 text-base-content/70"
										>override season: {batchSeasonOverride}</span
									>
								{/if}
							{:else}
								<span class="text-base-content/60">Episode:</span> S{seasonNumber}E{episodeNumber}
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<button class="btn btn-ghost" onclick={() => goToStep(2)}>Back</button>
				<button
					class="btn btn-primary"
					onclick={executeImportFlow}
					disabled={!canProceedToImport || executingImport}
				>
					{#if executingImport}
						<Loader2 class="h-4 w-4 animate-spin" />
						Importing...
					{:else}
						<Check class="h-4 w-4" />
						Start Import
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if step === 4 && executeError}
		<div class="rounded-xl border border-error/40 bg-error/5 p-5">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 rounded-full bg-error/20 p-2">
					<X class="h-5 w-5 text-error" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="text-xl font-semibold">Import Failed</h2>
					<p class="mt-1 text-sm text-base-content/80">
						{executeError}
					</p>
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							class="btn btn-sm btn-primary"
							onclick={() => {
								executeError = null;
								step = 3;
							}}
						>
							Try Again
						</button>
						{#if originLibraryLink}
							<a class="btn btn-outline btn-sm" href={originLibraryLink}>Back to Library Item</a>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{:else if step === 4 && executeResult}
		<div class="rounded-xl border border-success/40 bg-success/5 p-5">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 rounded-full bg-success/20 p-2">
					<Check class="h-5 w-5 text-success" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="text-xl font-semibold">Import Complete</h2>
					{#if bulkImportSummary}
						<p class="mt-1 text-sm text-base-content/80">
							Imported {bulkImportSummary.importedGroups} detected item(s)
							{#if bulkImportSummary.failedGroups > 0}
								with {bulkImportSummary.failedGroups} failure(s).
							{:else}
								successfully.
							{/if}
						</p>
						{#if skippedGroupCount > 0}
							<p class="mt-1 text-sm text-base-content/70">
								Skipped {skippedGroupCount} item(s).
							</p>
						{/if}
					{:else}
						<p class="mt-1 text-sm text-base-content/80">
							{executeResult.importedCount && executeResult.importedCount > 1
								? `${executeResult.importedCount} files imported and linked to library successfully.`
								: 'File imported and linked to library successfully.'}
						</p>
					{/if}
					<div class="mt-3 rounded-lg bg-base-100 p-3 text-sm break-all">
						<div>
							<span class="text-base-content/60">Imported Path:</span>
							{executeResult.importedPath}
						</div>
					</div>
					<div class="mt-4 flex flex-wrap gap-2">
						{#if completionLink}
							<a class="btn btn-sm btn-primary" href={completionLink}>
								{bulkImportSummary ? 'View Last Imported' : 'View in Library'}
							</a>
						{/if}
						{#if remainingGroupCount > 0}
							<button class="btn btn-outline btn-sm" onclick={continueWithNextDetected}>
								Import Next Detected Item ({remainingGroupCount})
							</button>
						{/if}
						<button class="btn btn-ghost btn-sm" onclick={resetWizard}>Import Another</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<ConfirmationModal
	open={leaveImportModalOpen}
	title="Cancel Import?"
	message="Cancel the current import session and leave this page? Your current import progress will be lost."
	confirmLabel="Cancel Import"
	cancelLabel="Stay"
	confirmVariant="error"
	onConfirm={confirmLeaveImportModal}
	onCancel={closeLeaveImportModal}
/>
