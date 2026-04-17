<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		CheckCircle,
		AlertCircle,
		ExternalLink,
		Library,
		FolderOpen,
		ShieldAlert,
		Eye,
		EyeOff,
		Captions,
		CaptionsOff,
		Search,
		SearchSlash,
		Server
	} from 'lucide-svelte';

	type LibraryBreakdownItem = {
		id: string;
		name: string;
		mediaType: string;
		mediaSubType: string;
		itemCount: number;
		usedBytes: number;
		path?: string | null;
		hasRootFolder?: boolean;
		rootFolderCount?: number;
		rootFolderIds?: string[];
		detachedItemCount?: number;
		defaultMonitored?: boolean;
		defaultSearchOnAdd?: boolean;
		defaultWantsSubtitles?: boolean;
		unmatchedCount?: number;
		needsScan?: boolean;
	};

	type RootFolderBreakdownItem = {
		id: string;
		name: string;
		mediaType: string;
		mediaSubType: string;
		itemCount: number;
		usedBytes: number;
		path?: string | null;
		accessible?: boolean;
		readOnly?: boolean;
		freeSpaceBytes?: number | null;
		totalSpaceBytes?: number | null;
		freeSpaceFormatted?: string | null;
		unmatchedCount?: number;
		lastScannedAt?: string | null;
		lastScanStatus?: string | null;
		needsScan?: boolean;
		freeRatio?: number | null;
	};

	type StorageSummary = {
		totalUsedBytes: number;
		moviesUsedBytes: number;
		tvUsedBytes: number;
		subtitlesUsedBytes: number;
		movieCount: number;
		seriesCount: number;
		subtitleCount: number;
		libraryBreakdown: LibraryBreakdownItem[];
		rootFolderBreakdown: RootFolderBreakdownItem[];
		health: {
			librariesWithoutRootFolder: number;
			inaccessibleRootFolders: number;
			readOnlyRootFolders: number;
			unmatchedFiles: number;
			rootFoldersNeedingScan: number;
			lastScan: {
				status: string;
				scanType: string;
				startedAt: string | null;
				completedAt: string | null;
				filesScanned: number;
				filesAdded: number;
				filesUpdated: number;
				filesRemoved: number;
				unmatchedFiles: number;
				errorMessage: string | null;
				durationMs: number | null;
			} | null;
		};
	};

	type ScanProgress = {
		phase: string;
		rootFolderId?: string;
		rootFolderPath?: string;
		filesFound: number;
		filesProcessed: number;
		filesAdded: number;
		filesUpdated: number;
		filesRemoved: number;
		unmatchedCount: number;
		currentFile?: string;
	};

	type ScanSuccess = {
		message: string;
		unmatchedCount: number;
	};

	type ServerStatus = {
		serverId: string;
		serverName: string;
		serverType: string;
		itemCount: number;
		lastSyncAt: string | null;
		lastSyncStatus: string | null;
	};

	interface Props {
		storage: StorageSummary;
		libraries: Array<{ id: string }>;
		rootFolders: Array<{ id: string }>;
		rootFolderCount: number;
		scanning: boolean;
		scanProgress: ScanProgress | null;
		scanError: string | null;
		scanSuccess: ScanSuccess | null;
		serverStatuses: ServerStatus[];
		formatBytes: (value: number) => string;
		onEditLibrary: (libraryId: string) => void;
		onEditRootFolder: (rootFolderId: string) => void;
		onScanRootFolder: (rootFolderId: string) => void;
	}

	let {
		storage,
		libraries,
		rootFolders,
		rootFolderCount,
		scanning,
		scanProgress,
		scanError,
		scanSuccess,
		serverStatuses,
		formatBytes,
		onEditLibrary,
		onEditRootFolder,
		onScanRootFolder
	}: Props = $props();

	const attentionItems = $derived.by(() => {
		const items: Array<{ label: string; tone: 'warning' | 'error' | 'info'; href?: string }> = [];
		if (storage.health.librariesWithoutRootFolder > 0) {
			items.push({
				label: `${storage.health.librariesWithoutRootFolder} librar${storage.health.librariesWithoutRootFolder === 1 ? 'y has' : 'ies have'} no root folder`,
				tone: 'warning',
				href: '#libraries'
			});
		}
		if (storage.health.inaccessibleRootFolders > 0) {
			items.push({
				label: `${storage.health.inaccessibleRootFolders} root folder${storage.health.inaccessibleRootFolders === 1 ? ' is' : 's are'} inaccessible`,
				tone: 'error',
				href: '#libraries'
			});
		}
		if (storage.health.unmatchedFiles > 0) {
			items.push({
				label: `${storage.health.unmatchedFiles} unmatched file${storage.health.unmatchedFiles === 1 ? '' : 's'} need review`,
				tone: 'info',
				href: '/library/unmatched'
			});
		}
		if (storage.health.readOnlyRootFolders > 0) {
			items.push({
				label: `${storage.health.readOnlyRootFolders} read-only root folder${storage.health.readOnlyRootFolders === 1 ? '' : 's'} configured`,
				tone: 'info',
				href: '#libraries'
			});
		}
		if (storage.health.rootFoldersNeedingScan > 0) {
			items.push({
				label: `${storage.health.rootFoldersNeedingScan} root folder${storage.health.rootFoldersNeedingScan === 1 ? ' needs' : 's need'} a fresh scan`,
				tone: 'warning',
				href: '#libraries'
			});
		}
		return items;
	});

	const rootFolderMap = $derived(new Map(storage.rootFolderBreakdown.map((rf) => [rf.id, rf])));

	const assignedRootFolderIds = $derived(
		new Set(storage.libraryBreakdown.flatMap((lib) => lib.rootFolderIds ?? []))
	);

	const unassignedRootFolders = $derived(
		storage.rootFolderBreakdown.filter((rf) => !assignedRootFolderIds.has(rf.id))
	);

	const DISK_SEGMENT_STYLES = {
		cinephage: 'background-color: #0ea5e9;',
		other: 'background-color: #f59e0b;',
		free: 'background-color: #22c55e;'
	} as const;

	function formatTimestamp(timestamp: string | null): string {
		if (!timestamp) return m.settings_general_never();
		return new Date(timestamp).toLocaleString();
	}

	function formatDuration(durationMs: number | null): string {
		if (!durationMs || durationMs < 1000) return m.settings_general_underOneSecond();
		const totalSeconds = Math.round(durationMs / 1000);
		if (totalSeconds < 60) return `${totalSeconds}s`;
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
	}

	function getStatusBadgeClass(enabled: boolean): string {
		return enabled
			? 'border-success/30 bg-success/10 text-success'
			: 'border-error/30 bg-error/10 text-error';
	}

	function formatPercent(value: number | null | undefined): string {
		if (value === null || value === undefined) return 'N/A';
		return `${Math.round(value * 100)}%`;
	}

	function getRootFolderTotalBytes(item: RootFolderBreakdownItem): number | null {
		if (item.totalSpaceBytes === null || item.totalSpaceBytes === undefined) return null;
		return item.totalSpaceBytes;
	}

	function getUsedRatio(item: RootFolderBreakdownItem): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		if (!totalBytes || totalBytes <= 0) return null;
		return item.usedBytes / totalBytes;
	}

	function getFreeRatio(item: RootFolderBreakdownItem): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		if (
			!totalBytes ||
			totalBytes <= 0 ||
			item.freeSpaceBytes === null ||
			item.freeSpaceBytes === undefined
		) {
			return null;
		}
		return Number(item.freeSpaceBytes) / totalBytes;
	}

	function getNonCinephageUsedBytes(item: RootFolderBreakdownItem): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		if (!totalBytes || item.freeSpaceBytes === null || item.freeSpaceBytes === undefined)
			return null;
		return Math.max(0, totalBytes - Number(item.freeSpaceBytes) - item.usedBytes);
	}

	function getNonCinephageRatio(item: RootFolderBreakdownItem): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		const bytes = getNonCinephageUsedBytes(item);
		if (!totalBytes || bytes === null) return null;
		return bytes / totalBytes;
	}

	function segmentWidth(ratio: number | null | undefined): string {
		if (ratio === null || ratio === undefined || ratio <= 0) return '0%';
		return `${Math.round(ratio * 100)}%`;
	}

	function typeRatio(value: number): string {
		if (storage.totalUsedBytes <= 0) return '0%';
		return `${Math.round((value / storage.totalUsedBytes) * 100)}%`;
	}

	function getRootFolderScanLabel(item: RootFolderBreakdownItem): string {
		if (item.lastScanStatus === 'completed') return m.settings_general_scanned();
		if (item.lastScanStatus === 'failed') return m.settings_general_scanFailed();
		if (item.lastScanStatus === 'running') return m.settings_general_scanning();
		if (item.needsScan) return m.settings_general_needsScan();
		return m.settings_general_pending();
	}

	function getRootFolderScanBadgeClass(item: RootFolderBreakdownItem): string {
		if (item.lastScanStatus === 'completed') return 'bg-success/15 text-success';
		if (item.lastScanStatus === 'failed') return 'bg-error/15 text-error';
		if (item.lastScanStatus === 'running') return 'bg-warning/20 text-warning-content';
		if (item.needsScan) return 'bg-warning/20 text-warning-content';
		return 'bg-base-200 text-base-content/70';
	}

	function getScanTone(status: string | null | undefined): string {
		if (status === 'completed') return 'bg-success';
		if (status === 'failed') return 'bg-error';
		if (status === 'running') return 'bg-warning animate-pulse';
		return 'bg-base-300';
	}

	function getServerTypeIcon(type: string): string {
		return type === 'jellyfin' ? '🟣' : type === 'emby' ? '🟢' : '🟠';
	}

	function getSyncStatusColor(status: string | null, lastSyncAt: string | null): string {
		if (status === 'failed') return 'badge-error';
		if (!lastSyncAt) return 'badge-ghost';
		const hoursSinceSync = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
		if (hoursSinceSync > 24) return 'badge-warning';
		return 'badge-success';
	}

	function hasLibrary(id: string): boolean {
		return libraries.some((library) => library.id === id);
	}

	function hasRootFolder(id: string): boolean {
		return rootFolders.some((folder) => folder.id === id);
	}
</script>

{#if attentionItems.length > 0}
	<div class="mb-4 rounded-lg border border-base-300 bg-base-200 p-4">
		<div class="mb-3 flex items-center gap-2">
			<ShieldAlert class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_needsAttention()}</h3>
		</div>
		<div class="flex flex-wrap gap-2">
			{#each attentionItems as item (item.label)}
				{#if item.href}
					<a
						href={item.href}
						class={`badge gap-2 border-none badge-lg ${
							item.tone === 'error'
								? 'bg-error/15 text-error'
								: item.tone === 'warning'
									? 'bg-warning/20 text-warning-content'
									: 'bg-info/15 text-info'
						}`}
					>
						{item.label}
					</a>
				{:else}
					<span
						class={`badge gap-2 border-none badge-lg ${
							item.tone === 'error'
								? 'bg-error/15 text-error'
								: item.tone === 'warning'
									? 'bg-warning/20 text-warning-content'
									: 'bg-info/15 text-info'
						}`}
					>
						{item.label}
					</span>
				{/if}
			{/each}
		</div>
	</div>
{/if}

{#if rootFolderCount === 0}
	<div class="alert alert-warning">
		<AlertCircle class="h-5 w-5" />
		<span>{m.settings_general_addFolderFirst()}</span>
	</div>
{:else}
	<div class="card bg-base-200 p-4">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
			<div class="shrink-0">
				<div class="text-3xl font-bold">{formatBytes(storage.totalUsedBytes)}</div>
				<div class="mt-1 text-sm text-base-content/70">
					{storage.movieCount} movies · {storage.seriesCount} series · {storage.subtitleCount} subtitles
				</div>
			</div>
			<div class="flex-1">
				<div class="flex h-4 overflow-hidden rounded-full bg-base-300">
					{#if storage.totalUsedBytes > 0}
						<div
							class="h-full bg-primary transition-all"
							style="width: {typeRatio(storage.moviesUsedBytes)}"
							title={`Movies: ${formatBytes(storage.moviesUsedBytes)}`}
						></div>
						<div
							class="h-full bg-secondary transition-all"
							style="width: {typeRatio(storage.tvUsedBytes)}"
							title={`TV: ${formatBytes(storage.tvUsedBytes)}`}
						></div>
						<div
							class="h-full bg-accent transition-all"
							style="width: {typeRatio(storage.subtitlesUsedBytes)}"
							title={`Subtitles: ${formatBytes(storage.subtitlesUsedBytes)}`}
						></div>
					{/if}
				</div>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
					<span class="inline-flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-primary"></span>
						Movies ({formatBytes(storage.moviesUsedBytes)})
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-secondary"></span>
						TV ({formatBytes(storage.tvUsedBytes)})
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-accent"></span>
						Subtitles ({formatBytes(storage.subtitlesUsedBytes)})
					</span>
				</div>
			</div>
		</div>
	</div>
	<div class="mt-2 flex justify-end">
		<a href="/settings/general/status/media" class="btn gap-2 btn-ghost btn-sm">
			Browse all media
			<ExternalLink class="h-3.5 w-3.5" />
		</a>
	</div>
{/if}

{#if scanError}
	<div class="mt-4 alert alert-error">
		<AlertCircle class="h-5 w-5" />
		<span>{scanError}</span>
	</div>
{/if}

{#if scanSuccess}
	<div class="mt-4 alert alert-success">
		<CheckCircle class="h-5 w-5" />
		<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<span>{scanSuccess.message}</span>
			{#if scanSuccess.unmatchedCount > 0}
				<a href="/library/unmatched" class="btn gap-1 btn-ghost btn-sm">
					{m.settings_general_viewUnmatchedFiles({ count: scanSuccess.unmatchedCount })}
					<ExternalLink class="h-3 w-3" />
				</a>
			{/if}
		</div>
	</div>
{/if}

{#if scanning && scanProgress}
	<div class="card mt-4 bg-base-200 p-3 sm:p-4">
		<div class="mb-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
			<span class="max-w-md truncate">
				{scanProgress.phase === 'scanning' ? m.settings_general_discoveringFiles() : ''}
				{scanProgress.phase === 'processing' ? m.settings_general_processing() : ''}
				{scanProgress.phase === 'matching' ? m.settings_general_matchingFiles() : ''}
				{scanProgress.rootFolderPath ?? ''}
			</span>
			<span class="text-base-content/60">
				{scanProgress.filesProcessed} / {scanProgress.filesFound}
				{m.common_files()}
			</span>
		</div>
		<progress
			class="progress w-full progress-primary"
			value={scanProgress.filesProcessed}
			max={scanProgress.filesFound || 1}
		></progress>
		<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
			<span>{m.settings_general_scanAdded()}: {scanProgress.filesAdded}</span>
			<span>{m.settings_general_scanUpdated()}: {scanProgress.filesUpdated}</span>
			<span>{m.settings_general_scanRemoved()}: {scanProgress.filesRemoved}</span>
			<span>{m.settings_general_scanUnmatched()}: {scanProgress.unmatchedCount}</span>
		</div>
		{#if scanProgress.currentFile}
			<div class="mt-2 truncate text-xs text-base-content/50">
				{scanProgress.currentFile}
			</div>
		{/if}
	</div>
{/if}

<div
	class="mt-4 flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
>
	<div class="flex items-center gap-3 text-sm">
		<span
			class="inline-block h-2 w-2 shrink-0 rounded-full {getScanTone(
				storage.health.lastScan?.status
			)}"
		></span>
		{#if storage.health.lastScan}
			<span class="text-base-content/70">
				{m.settings_general_lastScan()}:
				<strong class="text-base-content"
					>{formatTimestamp(
						storage.health.lastScan.completedAt ?? storage.health.lastScan.startedAt
					)}</strong
				>
				{#if storage.health.lastScan.durationMs}
					<span class="text-base-content/50"
						>({formatDuration(storage.health.lastScan.durationMs)})</span
					>
				{/if}
			</span>
			<span class="hidden text-base-content/50 sm:inline">
				— {storage.health.lastScan.filesScanned} scanned, {storage.health.lastScan.filesAdded} added
			</span>
		{:else}
			<span class="text-base-content/50">{m.settings_general_noScanHistory()}</span>
		{/if}
	</div>
	{#if serverStatuses.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each serverStatuses as server (server.serverId)}
				<span class="inline-flex items-center gap-1.5 text-xs text-base-content/70">
					<span>{getServerTypeIcon(server.serverType)}</span>
					<span>{server.serverName}</span>
					<span
						class="badge badge-xs {getSyncStatusColor(server.lastSyncStatus, server.lastSyncAt)}"
					>
						{server.lastSyncStatus ?? 'pending'}
					</span>
				</span>
			{/each}
		</div>
	{:else}
		<div class="flex items-center gap-2 text-xs text-base-content/40">
			<Server class="h-3.5 w-3.5" />
			No media servers
		</div>
	{/if}
</div>

<div id="libraries" class="mt-6">
	<div class="mb-3 flex items-center gap-2">
		<Library class="h-4 w-4" />
		<h3 class="font-semibold">Libraries &amp; Storage</h3>
	</div>

	<div class="space-y-4 md:hidden">
		{#each storage.libraryBreakdown as libItem (libItem.id)}
			{@const libRootFolders = (libItem.rootFolderIds ?? [])
				.map((id) => rootFolderMap.get(id))
				.filter(Boolean)}
			<div class="rounded-lg border border-base-300 bg-base-100 p-3">
				<div class="flex items-start justify-between gap-3">
					<div class="font-medium">{libItem.name}</div>
					<div class="flex flex-wrap justify-end gap-1">
						{#if libItem.hasRootFolder === false}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_noRootFolder()}
							</span>
						{/if}
						{#if libItem.mediaSubType === 'anime'}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_badgeAnime()}
							</span>
						{/if}
						{#if libItem.needsScan}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_needsScan()}
							</span>
						{/if}
						{#if (libItem.unmatchedCount ?? 0) > 0}
							<span class="badge border-none bg-info/15 badge-sm text-info">
								{m.settings_general_unmatchedCount({ count: libItem.unmatchedCount ?? 0 })}
							</span>
						{/if}
						{#if (libItem.detachedItemCount ?? 0) > 0}
							<span class="badge border-none bg-error/15 badge-sm text-error">
								{m.settings_general_detachedCount({ count: libItem.detachedItemCount ?? 0 })}
							</span>
						{/if}
					</div>
				</div>
				<div class="mt-1 text-xs text-base-content/50">
					{libItem.path ?? m.settings_general_noRootFolderAssigned()}
				</div>
				<div class="mt-2 flex flex-wrap gap-1">
					<span
						class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultMonitored ?? false)}`}
						title={m.settings_general_statusTooltip({
							label: m.settings_general_monitorByDefault(),
							status: libItem.defaultMonitored ? m.common_enabled() : m.common_disabled()
						})}
					>
						{#if libItem.defaultMonitored}
							<Eye class="h-3 w-3" />
						{:else}
							<EyeOff class="h-3 w-3" />
						{/if}
					</span>
					<span
						class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultSearchOnAdd ?? false)}`}
						title={m.settings_general_statusTooltip({
							label: m.settings_general_searchOnAddLabel(),
							status: libItem.defaultSearchOnAdd ? m.common_enabled() : m.common_disabled()
						})}
					>
						{#if libItem.defaultSearchOnAdd}
							<Search class="h-3 w-3" />
						{:else}
							<SearchSlash class="h-3 w-3" />
						{/if}
					</span>
					<span
						class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultWantsSubtitles ?? false)}`}
						title={m.settings_general_statusTooltip({
							label: m.settings_general_wantSubtitles(),
							status: libItem.defaultWantsSubtitles ? m.common_enabled() : m.common_disabled()
						})}
					>
						{#if libItem.defaultWantsSubtitles}
							<Captions class="h-3 w-3" />
						{:else}
							<CaptionsOff class="h-3 w-3" />
						{/if}
					</span>
				</div>
				<div class="mt-3 grid grid-cols-3 gap-2 text-sm">
					<div>
						<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
							{m.settings_general_classShort()}
						</div>
						<div>{libItem.mediaType} / {libItem.mediaSubType}</div>
					</div>
					<div>
						<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
							{m.settings_general_columnItems()}
						</div>
						<div>{libItem.itemCount}</div>
					</div>
					<div>
						<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
							{m.settings_general_columnUsed()}
						</div>
						<div>{formatBytes(libItem.usedBytes)}</div>
					</div>
				</div>
				{#if (libItem.hasRootFolder === false || (libItem.detachedItemCount ?? 0) > 0) && hasLibrary(libItem.id)}
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							class="btn ml-auto btn-outline btn-xs"
							onclick={() => onEditLibrary(libItem.id)}
						>
							{m.settings_general_reviewLibrary()}
						</button>
					</div>
				{/if}
				{#if libRootFolders.length > 0}
					<div class="mt-3 space-y-2 border-t border-base-200 pt-3">
						{#each libRootFolders as rf (rf!.id)}
							{@render mobileRootFolder(rf!)}
						{/each}
					</div>
				{/if}
			</div>
		{/each}

		{#if unassignedRootFolders.length > 0}
			<div class="rounded-lg border border-dashed border-base-300 bg-base-200/50 p-3">
				<div class="mb-2 text-xs font-medium tracking-wide text-base-content/50 uppercase">
					Unassigned Root Folders
				</div>
				{#each unassignedRootFolders as rf (rf.id)}
					{@render mobileRootFolder(rf)}
				{/each}
			</div>
		{/if}
	</div>

	<div class="hidden overflow-x-auto rounded-lg border border-base-300 md:block">
		<table class="table table-sm">
			<thead>
				<tr>
					<th>{m.settings_general_columnLibrary()}</th>
					<th>{m.settings_general_columnClassification()}</th>
					<th>{m.settings_general_columnItems()}</th>
					<th>{m.settings_general_columnUsed()}</th>
					<th>Disk</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each storage.libraryBreakdown as libItem (libItem.id)}
					{@const libRootFolders = (libItem.rootFolderIds ?? [])
						.map((id) => rootFolderMap.get(id))
						.filter(Boolean)}
					<tr class="bg-base-200/40 font-medium">
						<td>
							<div class="flex items-center gap-2">
								<Library class="h-3.5 w-3.5 text-base-content/40" />
								<span class="font-semibold">{libItem.name}</span>
								{#if libItem.hasRootFolder === false}
									<span class="badge border-none bg-warning badge-sm text-warning-content">
										{m.settings_general_noRootFolder()}
									</span>
								{/if}
								{#if libItem.mediaSubType === 'anime'}
									<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
										{m.settings_general_badgeAnime()}
									</span>
								{/if}
								{#if (libItem.unmatchedCount ?? 0) > 0}
									<span class="badge border-none bg-info/15 badge-sm text-info">
										{m.settings_general_unmatchedCount({ count: libItem.unmatchedCount ?? 0 })}
									</span>
								{/if}
								{#if (libItem.detachedItemCount ?? 0) > 0}
									<span class="badge border-none bg-error/15 badge-sm text-error">
										{m.settings_general_detachedCount({ count: libItem.detachedItemCount ?? 0 })}
									</span>
								{/if}
							</div>
							<div class="text-xs text-base-content/50">
								{libItem.path ?? m.settings_general_noRootFolderAssigned()}
							</div>
							<div class="mt-1 flex flex-wrap gap-1">
								<span
									class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultMonitored ?? false)}`}
									title={m.settings_general_statusTooltip({
										label: m.settings_general_monitorByDefault(),
										status: libItem.defaultMonitored ? m.common_enabled() : m.common_disabled()
									})}
								>
									{#if libItem.defaultMonitored}
										<Eye class="h-3 w-3" />
									{:else}
										<EyeOff class="h-3 w-3" />
									{/if}
								</span>
								<span
									class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultSearchOnAdd ?? false)}`}
									title={m.settings_general_statusTooltip({
										label: m.settings_general_searchOnAddLabel(),
										status: libItem.defaultSearchOnAdd ? m.common_enabled() : m.common_disabled()
									})}
								>
									{#if libItem.defaultSearchOnAdd}
										<Search class="h-3 w-3" />
									{:else}
										<SearchSlash class="h-3 w-3" />
									{/if}
								</span>
								<span
									class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultWantsSubtitles ?? false)}`}
									title={m.settings_general_statusTooltip({
										label: m.settings_general_wantSubtitles(),
										status: libItem.defaultWantsSubtitles ? m.common_enabled() : m.common_disabled()
									})}
								>
									{#if libItem.defaultWantsSubtitles}
										<Captions class="h-3 w-3" />
									{:else}
										<CaptionsOff class="h-3 w-3" />
									{/if}
								</span>
							</div>
							{#if (libItem.hasRootFolder === false || (libItem.detachedItemCount ?? 0) > 0) && hasLibrary(libItem.id)}
								<div class="mt-1">
									<button class="btn btn-outline btn-xs" onclick={() => onEditLibrary(libItem.id)}>
										{m.settings_general_reviewLibrary()}
									</button>
								</div>
							{/if}
						</td>
						<td>{libItem.mediaType} / {libItem.mediaSubType}</td>
						<td>{libItem.itemCount}</td>
						<td>{formatBytes(libItem.usedBytes)}</td>
						<td colspan="2"></td>
					</tr>
					{#each libRootFolders as rf (rf!.id)}
						{@render desktopRootFolderRow(rf!)}
					{/each}
				{/each}

				{#if unassignedRootFolders.length > 0}
					<tr class="bg-base-300/30">
						<td
							colspan="6"
							class="text-xs font-medium tracking-wide text-base-content/50 uppercase"
						>
							Unassigned Root Folders
						</td>
					</tr>
					{#each unassignedRootFolders as rf (rf.id)}
						{@render desktopRootFolderRow(rf)}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

{#snippet desktopRootFolderRow(item: RootFolderBreakdownItem)}
	<tr class="text-sm">
		<td>
			<div class="flex items-center gap-2 pl-5">
				<FolderOpen class="h-3 w-3 text-base-content/30" />
				<span class="text-base-content/80">{item.name}</span>
				{#if item.accessible === false}
					<span class="badge border-none bg-error/15 badge-sm text-error">
						{m.settings_general_inaccessible()}
					</span>
				{/if}
				{#if item.readOnly}
					<span class="badge border-none bg-info/15 badge-sm text-info">
						{m.rootFolders_badgeReadOnly()}
					</span>
				{/if}
				{#if (item.unmatchedCount ?? 0) > 0}
					<span class="badge border-none bg-info/15 badge-sm text-info">
						{m.settings_general_unmatchedCount({ count: item.unmatchedCount ?? 0 })}
					</span>
				{/if}
			</div>
			<div class="truncate pl-10 text-xs text-base-content/50">{item.path}</div>
			<div class="pl-10 text-xs text-base-content/50">
				{m.settings_general_lastScanLabel({
					value: formatTimestamp(item.lastScannedAt ?? null)
				})}
			</div>
			{#if (item.accessible === false || item.needsScan) && hasRootFolder(item.id)}
				<div class="mt-1 flex flex-wrap gap-2 pl-10">
					<button class="btn btn-outline btn-xs" onclick={() => onEditRootFolder(item.id)}>
						{m.settings_general_editFolder()}
					</button>
					{#if item.needsScan}
						<button
							class="btn btn-outline btn-xs"
							onclick={() => onScanRootFolder(item.id)}
							disabled={scanning}
						>
							{m.settings_general_scanNow()}
						</button>
					{/if}
				</div>
			{/if}
		</td>
		<td>{item.mediaType} / {item.mediaSubType}</td>
		<td>{item.itemCount}</td>
		<td>
			<div>{m.settings_general_trackedUsed({ used: formatBytes(item.usedBytes) })}</div>
			<div class="text-xs text-base-content/50">
				{#if getRootFolderTotalBytes(item)}
					{m.settings_general_diskFreeOfTotal({
						free: item.freeSpaceFormatted ?? m.common_na(),
						total: formatBytes(getRootFolderTotalBytes(item) ?? 0)
					})}
				{:else}
					{m.settings_general_capacityUnknown()}
				{/if}
			</div>
		</td>
		<td>
			{#if getUsedRatio(item) !== null}
				<div class="flex items-center gap-2">
					<div class="flex h-2 w-24 overflow-hidden rounded-full bg-base-200">
						<div
							class="h-2"
							style={`${DISK_SEGMENT_STYLES.cinephage} width: ${segmentWidth(getUsedRatio(item))}`}
							title={`Cinephage: ${formatBytes(item.usedBytes)}`}
						></div>
						<div
							class="h-2"
							style={`${DISK_SEGMENT_STYLES.other} width: ${segmentWidth(getNonCinephageRatio(item))}`}
							title={`Other: ${formatBytes(getNonCinephageUsedBytes(item) ?? 0)}`}
						></div>
						<div
							class="h-2"
							style={`${DISK_SEGMENT_STYLES.free} width: ${segmentWidth(getFreeRatio(item))}`}
							title={`Free: ${item.freeSpaceFormatted ?? 'N/A'}`}
						></div>
					</div>
					<span class="text-xs text-base-content/50">{formatPercent(getUsedRatio(item))}</span>
				</div>
			{:else}
				<span class="text-xs text-base-content/40">—</span>
			{/if}
		</td>
		<td>
			<span class={`badge border-none badge-sm ${getRootFolderScanBadgeClass(item)}`}>
				{getRootFolderScanLabel(item)}
			</span>
		</td>
	</tr>
{/snippet}

{#snippet mobileRootFolder(item: RootFolderBreakdownItem)}
	<div class="rounded-lg border border-base-200 bg-base-200/50 p-2.5">
		<div class="flex items-start justify-between gap-2">
			<div class="flex items-center gap-1.5 text-sm font-medium">
				<FolderOpen class="h-3 w-3 text-base-content/40" />
				{item.name}
			</div>
			<div class="flex flex-wrap justify-end gap-1">
				{#if item.accessible === false}
					<span class="badge border-none bg-error/15 badge-sm text-error">
						{m.settings_general_inaccessible()}
					</span>
				{/if}
				{#if item.readOnly}
					<span class="badge border-none bg-info/15 badge-sm text-info">
						{m.rootFolders_badgeReadOnly()}
					</span>
				{/if}
			</div>
		</div>
		<div class="mt-0.5 truncate text-xs text-base-content/50">{item.path}</div>
		<div class="mt-2 grid grid-cols-3 gap-2 text-xs">
			<div>
				<div class="text-base-content/50">{m.settings_general_columnItems()}</div>
				<div class="font-medium">{item.itemCount}</div>
			</div>
			<div>
				<div class="text-base-content/50">{m.settings_general_columnUsed()}</div>
				<div class="font-medium">{formatBytes(item.usedBytes)}</div>
			</div>
			<div>
				<div class="text-base-content/50">{m.settings_general_diskFree()}</div>
				<div class="font-medium">{item.freeSpaceFormatted ?? 'N/A'}</div>
			</div>
		</div>
		{#if getUsedRatio(item) !== null}
			<div class="mt-2">
				<div class="flex h-2 overflow-hidden rounded-full bg-base-300">
					<div
						class="h-2"
						style={`${DISK_SEGMENT_STYLES.cinephage} width: ${segmentWidth(getUsedRatio(item))}`}
					></div>
					<div
						class="h-2"
						style={`${DISK_SEGMENT_STYLES.other} width: ${segmentWidth(getNonCinephageRatio(item))}`}
					></div>
					<div
						class="h-2"
						style={`${DISK_SEGMENT_STYLES.free} width: ${segmentWidth(getFreeRatio(item))}`}
					></div>
				</div>
				<div class="mt-1 flex gap-3 text-[10px] text-base-content/50">
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-full" style={DISK_SEGMENT_STYLES.cinephage}></span>
						{formatPercent(getUsedRatio(item))}
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-full" style={DISK_SEGMENT_STYLES.other}></span>
						{formatPercent(getNonCinephageRatio(item))}
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-full" style={DISK_SEGMENT_STYLES.free}></span>
						{formatPercent(getFreeRatio(item))}
					</span>
				</div>
			</div>
		{/if}
		<div class="mt-2 flex flex-wrap items-center gap-1">
			<span class={`badge border-none badge-sm ${getRootFolderScanBadgeClass(item)}`}>
				{getRootFolderScanLabel(item)}
			</span>
			{#if (item.accessible === false || item.needsScan) && hasRootFolder(item.id)}
				<div class="ml-auto flex gap-1">
					<button class="btn btn-outline btn-xs" onclick={() => onEditRootFolder(item.id)}>
						{m.settings_general_editFolder()}
					</button>
					{#if item.needsScan}
						<button
							class="btn btn-outline btn-xs"
							onclick={() => onScanRootFolder(item.id)}
							disabled={scanning}
						>
							{m.settings_general_scanNow()}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/snippet}
