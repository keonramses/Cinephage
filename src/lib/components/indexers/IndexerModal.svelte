<script lang="ts">
	import { X, Loader2, Search, Globe, Lock, Zap } from 'lucide-svelte';
	import type { IndexerDefinition, Indexer, IndexerFormData } from '$lib/types/indexer';
	import { computeUIHints } from '$lib/types/indexer';
	import IndexerSettingsFields from './IndexerSettingsFields.svelte';
	import { SectionHeader, ToggleSetting, TestResult } from '$lib/components/ui/modal';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		indexer?: Indexer | null;
		definitions: IndexerDefinition[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: IndexerFormData) => void;
		onDelete?: () => void;
		onTest: (data: IndexerFormData) => Promise<{ success: boolean; error?: string }>;
	}

	let {
		open,
		mode,
		indexer = null,
		definitions,
		saving,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Search state
	let searchQuery = $state('');

	// Form state - Basic (defaults only, effect syncs from props)
	let selectedDefinitionId = $state('');
	let name = $state('');
	let url = $state('');
	let enabled = $state(true);
	let priority = $state(25);
	let settings = $state<Record<string, string>>({});

	// Form state - Search capabilities
	let enableAutomaticSearch = $state(true);
	let enableInteractiveSearch = $state(true);

	// Form state - Torrent seeding settings
	let minimumSeeders = $state(1);
	let seedRatio = $state('');
	let seedTime = $state<number | ''>('');
	let packSeedTime = $state<number | ''>('');
	let preferMagnetUrl = $state(false);

	// Test state
	let testing = $state(false);
	let testResult = $state<{ success: boolean; error?: string } | null>(null);

	// Validation state
	let urlTouched = $state(false);
	const urlValid = $derived(() => {
		if (!url) return true; // Empty is handled by required check
		try {
			const parsed = new URL(url);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	});
	const urlError = $derived(() => {
		if (!urlTouched || !url) return '';
		if (!urlValid()) return 'Please enter a valid URL (e.g., https://example.com)';
		return '';
	});

	// Derived - selected definition and basic modal state
	const selectedDefinition = $derived(definitions.find((d) => d.id === selectedDefinitionId));
	const modalTitle = $derived(mode === 'add' ? 'Add Indexer' : 'Edit Indexer');

	// For internal indexers (like Cinephage Stream), the definition won't be in the list
	// In edit mode, derive protocol from the indexer itself when definition is missing
	const effectiveProtocol = $derived(
		selectedDefinition?.protocol ?? indexer?.protocol ?? 'torrent'
	);

	// Check if this is an internal/special indexer (definition not in list but indexer exists)
	const isInternalIndexer = $derived(mode === 'edit' && indexer && !selectedDefinition);

	// Derived - UI visibility hints (computed from definition or indexer properties)
	const uiHints = $derived(() => {
		if (selectedDefinition) {
			return computeUIHints(selectedDefinition);
		}
		// For internal indexers, derive from the indexer itself
		if (indexer) {
			return computeUIHints({
				type: 'public', // Internal indexers are treated as public (no auth)
				protocol: indexer.protocol,
				settings: []
			});
		}
		return null;
	});

	const isTorrent = $derived(uiHints()?.showTorrentSettings ?? false);
	const isStreaming = $derived(uiHints()?.isStreaming ?? false);

	// For streaming indexers, separate text/password settings from checkbox toggles
	const streamingTextSettings = $derived(
		selectedDefinition?.settings?.filter((s) => s.type === 'text' || s.type === 'password') ?? []
	);
	const streamingCheckboxSettings = $derived(
		selectedDefinition?.settings?.filter((s) => s.type === 'checkbox') ?? []
	);

	// Check if there are any configurable auth settings to show
	const hasAuthSettings = $derived(
		selectedDefinition?.settings &&
			selectedDefinition.settings.length > 0 &&
			selectedDefinition.settings.some(
				(s) =>
					s.type !== 'info' &&
					s.type !== 'info_cookie' &&
					s.type !== 'info_cloudflare' &&
					s.type !== 'info_useragent'
			)
	);

	// All available URLs from definition (primary + alternates)
	const definitionUrls = $derived(
		[selectedDefinition?.siteUrl ?? '', ...(selectedDefinition?.alternateUrls ?? [])].filter(
			Boolean
		)
	);

	// Alternate URLs = all definition URLs except the selected primary
	const alternateUrls = $derived(definitionUrls.filter((u) => u !== url));

	// Filter definitions based on search
	const filteredDefinitions = $derived(() => {
		if (!searchQuery.trim()) return definitions;
		const query = searchQuery.toLowerCase();
		return definitions.filter(
			(d) =>
				d.name.toLowerCase().includes(query) ||
				d.description?.toLowerCase().includes(query) ||
				d.id.toLowerCase().includes(query)
		);
	});

	// Group definitions by type (public/private/streaming)
	const groupedDefinitions = $derived(() => {
		const filtered = filteredDefinitions();
		return {
			public: filtered.filter((d) => d.type === 'public' && d.protocol !== 'streaming'),
			private: filtered.filter((d) => d.type === 'private' || d.type === 'semi-private'),
			streaming: filtered.filter((d) => d.protocol === 'streaming')
		};
	});

	// Reset form when modal opens or indexer changes
	$effect(() => {
		if (open) {
			// Only reset when modal opens, not when derived values change
			const initialDefId = indexer?.definitionId ?? '';
			const def = definitions.find((d) => d.id === initialDefId);

			selectedDefinitionId = initialDefId;
			name = indexer?.name ?? def?.name ?? '';
			url = indexer?.baseUrl ?? def?.siteUrl ?? '';
			enabled = indexer?.enabled ?? true;
			priority = indexer?.priority ?? 25;
			settings = { ...(indexer?.settings ?? {}) };

			// Search capabilities
			enableAutomaticSearch = indexer?.enableAutomaticSearch ?? true;
			enableInteractiveSearch = indexer?.enableInteractiveSearch ?? true;

			// Torrent seeding settings
			minimumSeeders = indexer?.minimumSeeders ?? 1;
			seedRatio = indexer?.seedRatio ?? '';
			seedTime = indexer?.seedTime ?? '';
			packSeedTime = indexer?.packSeedTime ?? '';
			preferMagnetUrl = indexer?.preferMagnetUrl ?? false;

			searchQuery = '';
			testResult = null;
		}
	});

	// Update defaults when definition changes in add mode
	$effect(() => {
		if (mode === 'add' && selectedDefinition) {
			if (!url) url = selectedDefinition.siteUrl ?? '';
			if (!name) name = selectedDefinition.name;
		}
	});

	function handleDefinitionSelect(defId: string) {
		selectedDefinitionId = defId;
		const def = definitions.find((d) => d.id === defId);
		if (def && mode === 'add') {
			name = def.name;
			url = def.siteUrl ?? '';
			settings = {};
		}
	}

	function getFormData(): IndexerFormData {
		return {
			name,
			definitionId: selectedDefinitionId,
			baseUrl: url,
			alternateUrls,
			enabled,
			priority,
			protocol: effectiveProtocol,
			settings,
			enableAutomaticSearch,
			enableInteractiveSearch,
			minimumSeeders,
			seedRatio: seedRatio || null,
			seedTime: seedTime === '' ? null : seedTime,
			packSeedTime: packSeedTime === '' ? null : packSeedTime,
			preferMagnetUrl
		};
	}

	async function handleTest() {
		testing = true;
		testResult = null;
		try {
			testResult = await onTest(getFormData());
		} finally {
			testing = false;
		}
	}

	function handleSave() {
		onSave(getFormData());
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-3xl overflow-x-hidden overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">{modalTitle}</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Definition Selection (only in add mode when not selected) -->
			{#if mode === 'add' && !selectedDefinitionId}
				<div class="space-y-4">
					<!-- Search -->
					<div class="form-control">
						<div class="relative">
							<Search
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/50"
							/>
							<input
								type="text"
								class="input-bordered input w-full pl-10"
								placeholder="Search indexers..."
								bind:value={searchQuery}
							/>
						</div>
					</div>

					<!-- Definition List -->
					<div class="max-h-[400px] overflow-y-auto rounded-lg border border-base-300">
						{#if groupedDefinitions().public.length > 0}
							<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200 px-4 py-2">
								<span class="flex items-center gap-2 text-sm font-medium text-base-content/70">
									<Globe class="h-4 w-4" />
									Public Indexers
								</span>
							</div>
							{#each groupedDefinitions().public as def (def.id)}
								<button
									type="button"
									class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
									onclick={() => handleDefinitionSelect(def.id)}
								>
									<div class="rounded-lg bg-success/10 p-2">
										<Globe class="h-5 w-5 text-success" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="font-semibold">{def.name}</span>
											<span class="badge badge-ghost badge-xs">{def.protocol}</span>
										</div>
										{#if def.description}
											<p class="mt-0.5 truncate text-sm text-base-content/60">{def.description}</p>
										{/if}
									</div>
									<div class="flex flex-col items-end gap-1">
										<span class="badge badge-sm badge-success">Public</span>
									</div>
								</button>
							{/each}
						{/if}

						{#if groupedDefinitions().private.length > 0}
							<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200 px-4 py-2">
								<span class="flex items-center gap-2 text-sm font-medium text-base-content/70">
									<Lock class="h-4 w-4" />
									Private Indexers
								</span>
							</div>
							{#each groupedDefinitions().private as def (def.id)}
								<button
									type="button"
									class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
									onclick={() => handleDefinitionSelect(def.id)}
								>
									<div class="rounded-lg bg-warning/10 p-2">
										<Lock class="h-5 w-5 text-warning" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="font-semibold">{def.name}</span>
											<span class="badge badge-ghost badge-xs">{def.protocol}</span>
										</div>
										{#if def.description}
											<p class="mt-0.5 truncate text-sm text-base-content/60">{def.description}</p>
										{/if}
									</div>
									<div class="flex flex-col items-end gap-1">
										<span class="badge badge-sm badge-warning">Private</span>
										{#if def.settings && def.settings.length > 0}
											<span class="badge badge-ghost badge-xs">Auth Required</span>
										{/if}
									</div>
								</button>
							{/each}
						{/if}

						{#if groupedDefinitions().streaming.length > 0}
							<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200 px-4 py-2">
								<span class="flex items-center gap-2 text-sm font-medium text-base-content/70">
									<Zap class="h-4 w-4" />
									Streaming
								</span>
							</div>
							{#each groupedDefinitions().streaming as def (def.id)}
								<button
									type="button"
									class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
									onclick={() => handleDefinitionSelect(def.id)}
								>
									<div class="rounded-lg bg-info/10 p-2">
										<Zap class="h-5 w-5 text-info" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="font-semibold">{def.name}</span>
											<span class="badge badge-ghost badge-xs">streaming</span>
										</div>
										{#if def.description}
											<p class="mt-0.5 truncate text-sm text-base-content/60">{def.description}</p>
										{/if}
									</div>
									<div class="flex flex-col items-end gap-1">
										<span class="badge badge-sm badge-info">Streaming</span>
									</div>
								</button>
							{/each}
						{/if}

						{#if filteredDefinitions().length === 0}
							<div class="p-8 text-center text-base-content/50">
								No indexers match "{searchQuery}"
							</div>
						{/if}
					</div>

					<p class="text-center text-sm text-base-content/50">
						{definitions.length} indexers available
					</p>
				</div>

				<div class="modal-action">
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				</div>
			{:else}
				<!-- Selected definition header (in add mode) -->
				{#if mode === 'add' && selectedDefinition}
					<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
						<div class="flex items-center gap-3">
							<div
								class="rounded-lg p-2 {isStreaming
									? 'bg-info/10'
									: selectedDefinition.type === 'public'
										? 'bg-success/10'
										: 'bg-warning/10'}"
							>
								{#if isStreaming}
									<Zap class="h-5 w-5 text-info" />
								{:else if selectedDefinition.type === 'public'}
									<Globe class="h-5 w-5 text-success" />
								{:else}
									<Lock class="h-5 w-5 text-warning" />
								{/if}
							</div>
							<div>
								<div class="flex items-center gap-2">
									<span class="font-semibold">{selectedDefinition.name}</span>
									<span class="badge badge-ghost badge-sm">{selectedDefinition.protocol}</span>
								</div>
								{#if selectedDefinition.description}
									<div class="text-sm text-base-content/60">{selectedDefinition.description}</div>
								{/if}
							</div>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => (selectedDefinitionId = '')}
						>
							Change
						</button>
					</div>
				{/if}

				<!-- Internal indexer header (in edit mode for auto-managed indexers like Cinephage Stream) -->
				{#if isInternalIndexer && indexer}
					<div class="mb-6 flex items-center justify-between rounded-lg bg-info/10 px-4 py-3">
						<div class="flex items-center gap-3">
							<div class="rounded-lg bg-info/20 p-2">
								<Zap class="h-5 w-5 text-info" />
							</div>
							<div>
								<div class="flex items-center gap-2">
									<span class="font-semibold">{indexer.name}</span>
									<span class="badge badge-sm badge-info">Internal</span>
									<span class="badge badge-ghost badge-sm">{indexer.protocol}</span>
								</div>
								<div class="text-sm text-base-content/60">
									This is a built-in indexer that is automatically managed.
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Simplified form for internal indexers (like Cinephage Stream) -->
				{#if isInternalIndexer}
					<div class="space-y-4">
						<!-- External URL for streaming access -->
						{#if isStreaming}
							<div class="form-control">
								<label class="label py-1" for="internal-url">
									<span class="label-text">External URL</span>
									<span class="label-text-alt text-xs">Required for streaming</span>
								</label>
								<input
									id="internal-url"
									type="url"
									class="input-bordered input input-sm {urlError() ? 'input-error' : ''}"
									bind:value={url}
									onblur={() => (urlTouched = true)}
									placeholder="http://192.168.1.100:3000"
								/>
								{#if urlError()}
									<p class="label py-0">
										<span class="label-text-alt text-error">{urlError()}</span>
									</p>
								{:else}
									<p class="label py-0">
										<span class="label-text-alt text-xs">
											The external URL where Jellyfin/Kodi can reach this server
										</span>
									</p>
								{/if}
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-4">
							<div class="form-control">
								<label class="label py-1" for="priority">
									<span class="label-text">Priority</span>
									<span class="label-text-alt text-xs">1-100</span>
								</label>
								<input
									id="priority"
									type="number"
									class="input-bordered input input-sm"
									bind:value={priority}
									min="1"
									max="100"
								/>
								<p class="label py-0">
									<span class="label-text-alt text-xs">Lower = higher priority</span>
								</p>
							</div>

							<div class="form-control">
								<span class="label py-1">
									<span class="label-text">Status</span>
								</span>
								<label class="label cursor-pointer justify-start gap-2 py-2">
									<input type="checkbox" class="toggle toggle-sm" bind:checked={enabled} />
									<span class="label-text text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
								</label>
							</div>
						</div>

						<SectionHeader title="Search Settings" class="mt-2" />
						<div class="space-y-2">
							<ToggleSetting
								bind:checked={enableAutomaticSearch}
								label="Automatic Search"
								description="Search when items are added or upgraded"
							/>
							<ToggleSetting
								bind:checked={enableInteractiveSearch}
								label="Interactive Search"
								description="Manual searches from the UI"
							/>
						</div>

						{#if isStreaming}
							<div class="mt-4 rounded-lg bg-info/10 p-4">
								<p class="text-sm text-base-content/70">
									Streaming provides instant playback via .strm files without needing a torrent
									client.
								</p>
							</div>
						{/if}
					</div>
				{:else if isStreaming && selectedDefinition}
					<!-- Streaming Indexer Layout - Single column, compact providers grid -->
					<div class="space-y-6">
						<!-- Basic Settings Row -->
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div class="form-control">
								<label class="label py-1" for="name">
									<span class="label-text">Name</span>
								</label>
								<input
									id="name"
									type="text"
									class="input-bordered input input-sm"
									bind:value={name}
									placeholder={selectedDefinition?.name ?? 'Streaming Indexer'}
								/>
							</div>

							<div class="form-control">
								<label class="label py-1" for="priority">
									<span class="label-text">Priority</span>
									<span class="label-text-alt text-xs">1-100</span>
								</label>
								<input
									id="priority"
									type="number"
									class="input-bordered input input-sm"
									bind:value={priority}
									min="1"
									max="100"
								/>
							</div>

							<div class="form-control">
								<span class="label py-1">
									<span class="label-text">Status</span>
								</span>
								<label class="label cursor-pointer justify-start gap-2 py-2">
									<input
										type="checkbox"
										class="toggle toggle-primary toggle-sm"
										bind:checked={enabled}
									/>
									<span class="label-text text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
								</label>
							</div>
						</div>

						<!-- Configuration Section (text inputs) -->
						{#if streamingTextSettings.length > 0}
							<div>
								<SectionHeader title="Configuration" />
								<div class="mt-2 space-y-3">
									{#each streamingTextSettings as setting (setting.name)}
										<div class="form-control">
											<label class="label py-1" for={setting.name}>
												<span class="label-text">{setting.label}</span>
											</label>
											<input
												type={setting.type === 'password' ? 'password' : 'text'}
												id={setting.name}
												class="input-bordered input input-sm"
												placeholder={setting.placeholder ?? setting.default ?? ''}
												value={settings[setting.name] ?? ''}
												oninput={(e) => (settings[setting.name] = e.currentTarget.value)}
											/>
											{#if setting.helpText}
												<p class="label py-0">
													<span class="label-text-alt text-xs text-base-content/60"
														>{setting.helpText}</span
													>
												</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Providers Section (checkboxes in grid) -->
						{#if streamingCheckboxSettings.length > 0}
							<div>
								<SectionHeader title="Streaming Providers" />
								<div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
									{#each streamingCheckboxSettings as setting (setting.name)}
										<label
											class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-base-200"
										>
											<input
												type="checkbox"
												class="checkbox checkbox-sm checkbox-primary"
												checked={settings[setting.name] === 'true' ||
													(settings[setting.name] === undefined && setting.default === 'true')}
												onchange={(e) =>
													(settings[setting.name] = e.currentTarget.checked ? 'true' : 'false')}
											/>
											<div class="min-w-0">
												<span class="text-sm font-medium">{setting.label}</span>
												{#if setting.helpText}
													<p class="truncate text-xs text-base-content/50" title={setting.helpText}>
														{setting.helpText}
													</p>
												{/if}
											</div>
										</label>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Search Settings -->
						<div>
							<SectionHeader title="Search Settings" />
							<div class="mt-2 flex flex-wrap gap-x-8 gap-y-2">
								<ToggleSetting
									bind:checked={enableAutomaticSearch}
									label="Automatic Search"
									description="Search when items are added or upgraded"
								/>
								<ToggleSetting
									bind:checked={enableInteractiveSearch}
									label="Interactive Search"
									description="Manual searches from the UI"
								/>
							</div>
						</div>

						<!-- Streaming Info -->
						<div class="rounded-lg bg-info/10 p-4">
							<p class="text-sm text-base-content/70">
								Streaming provides instant playback via .strm files. No torrent client required.
							</p>
						</div>
					</div>
				{:else}
					<!-- Main Form - Two Column Layout (for regular indexers) -->
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
						<!-- Left Column: Connection -->
						<div class="space-y-4">
							<SectionHeader title="Connection" />

							<div class="form-control">
								<label class="label py-1" for="name">
									<span class="label-text">Name</span>
								</label>
								<input
									id="name"
									type="text"
									class="input-bordered input input-sm"
									bind:value={name}
									placeholder={selectedDefinition?.name ?? 'My Indexer'}
								/>
							</div>

							<!-- URL Selection -->
							<div class="form-control">
								<label class="label py-1" for="url">
									<span class="label-text">URL</span>
									{#if alternateUrls.length > 0}
										<span class="label-text-alt text-xs text-base-content/60">
											+{alternateUrls.length} failover{alternateUrls.length > 1 ? 's' : ''}
										</span>
									{/if}
								</label>
								{#if definitionUrls.length > 1}
									<select id="url" class="select-bordered select select-sm" bind:value={url}>
										{#each definitionUrls as availableUrl (availableUrl)}
											<option value={availableUrl}>
												{availableUrl}
												{#if availableUrl === selectedDefinition?.siteUrl}(default){/if}
											</option>
										{/each}
									</select>
								{:else}
									<input
										id="url"
										type="url"
										class="input-bordered input input-sm {urlError() ? 'input-error' : ''}"
										bind:value={url}
										onblur={() => (urlTouched = true)}
										placeholder="https://..."
									/>
									{#if urlError()}
										<p class="label py-0">
											<span class="label-text-alt text-error">{urlError()}</span>
										</p>
									{/if}
								{/if}
							</div>

							<div class="grid grid-cols-2 gap-3">
								<div class="form-control">
									<label class="label py-1" for="priority">
										<span class="label-text">Priority</span>
										<span class="label-text-alt text-xs">1-100</span>
									</label>
									<input
										id="priority"
										type="number"
										class="input-bordered input input-sm"
										bind:value={priority}
										min="1"
										max="100"
									/>
									<p class="label py-0">
										<span class="label-text-alt text-xs">Lower = higher priority</span>
									</p>
								</div>

								<div class="form-control">
									<span class="label py-1">
										<span class="label-text">Status</span>
									</span>
									<label class="label cursor-pointer justify-start gap-2 py-2">
										<input type="checkbox" class="checkbox checkbox-sm" bind:checked={enabled} />
										<span class="label-text text-sm">Enabled</span>
									</label>
								</div>
							</div>

							<!-- Indexer Settings (API keys, config, etc) - only show if there are actual configurable settings -->
							{#if hasAuthSettings && selectedDefinition}
								<SectionHeader
									title={isStreaming ? 'Configuration' : 'Authentication'}
									class="mt-4"
								/>
								<IndexerSettingsFields
									settingsDefinitions={selectedDefinition.settings}
									bind:settings
								/>
							{/if}
						</div>

						<!-- Right Column: Search Settings -->
						<div class="space-y-4">
							<SectionHeader title="Search Settings" />

							<div class="space-y-2">
								<ToggleSetting
									bind:checked={enableAutomaticSearch}
									label="Automatic Search"
									description="Search when items are added or upgraded"
								/>
								<ToggleSetting
									bind:checked={enableInteractiveSearch}
									label="Interactive Search"
									description="Manual searches from the UI"
								/>
							</div>

							{#if isTorrent}
								<SectionHeader title="Torrent Settings" class="mt-4" />

								<div class="grid grid-cols-2 gap-3">
									<div class="form-control">
										<label class="label py-1" for="minimumSeeders">
											<span class="label-text">Min Seeders</span>
											<span class="label-text-alt text-xs">0+</span>
										</label>
										<input
											id="minimumSeeders"
											type="number"
											class="input-bordered input input-sm"
											bind:value={minimumSeeders}
											min="0"
										/>
										<p class="label py-0">
											<span class="label-text-alt text-xs">Skip releases below this</span>
										</p>
									</div>

									<div class="form-control">
										<label class="label py-1" for="seedRatio">
											<span class="label-text">Seed Ratio</span>
										</label>
										<input
											id="seedRatio"
											type="text"
											class="input-bordered input input-sm"
											bind:value={seedRatio}
											placeholder="e.g., 1.0"
										/>
										<p class="label py-0">
											<span class="label-text-alt text-xs">Empty = use client default</span>
										</p>
									</div>

									<div class="form-control">
										<label class="label py-1" for="seedTime">
											<span class="label-text">Seed Time</span>
											<span class="label-text-alt text-xs">minutes</span>
										</label>
										<input
											id="seedTime"
											type="number"
											class="input-bordered input input-sm"
											bind:value={seedTime}
											min="0"
											placeholder="Minutes"
										/>
									</div>

									<div class="form-control">
										<label class="label py-1" for="packSeedTime">
											<span class="label-text">Pack Seed Time</span>
											<span class="label-text-alt text-xs">minutes</span>
										</label>
										<input
											id="packSeedTime"
											type="number"
											class="input-bordered input input-sm"
											bind:value={packSeedTime}
											min="0"
											placeholder="Minutes"
										/>
									</div>
								</div>

								<ToggleSetting bind:checked={preferMagnetUrl} label="Prefer Magnet URLs" />
							{/if}

							{#if isStreaming}
								<SectionHeader title="Streaming Info" class="mt-4" />
								<div class="rounded-lg bg-info/10 p-4">
									<p class="text-sm text-base-content/70">
										Streaming indexers provide instant playback via .strm files. No torrent client
										required.
									</p>
									<ul class="mt-2 list-inside list-disc text-sm text-base-content/60">
										<li>Results are automatically scored lower than torrents</li>
										<li>Can be upgraded to higher quality torrent releases</li>
										<li>Perfect for watching content immediately</li>
									</ul>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Test Result -->
				<TestResult result={testResult} />

				<!-- Actions -->
				<div class="modal-action">
					{#if mode === 'edit' && onDelete}
						<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
					{/if}

					<button
						class="btn btn-ghost"
						onclick={handleTest}
						disabled={testing || saving || !url || !name || !urlValid()}
					>
						{#if testing}
							<Loader2 class="h-4 w-4 animate-spin" />
						{/if}
						Test
					</button>

					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>

					<button
						class="btn btn-primary"
						onclick={handleSave}
						disabled={saving || !url || !name || !urlValid()}
					>
						{#if saving}
							<Loader2 class="h-4 w-4 animate-spin" />
						{/if}
						Save
					</button>
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
