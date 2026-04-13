<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		Key,
		Copy,
		Eye,
		EyeOff,
		RefreshCw,
		Server,
		Shield,
		Globe,
		Check,
		AlertCircle,
		Film,
		ChevronRight,
		CheckCircle,
		XCircle,
		Activity,
		Clock,
		Trash2,
		Play,
		Download,
		Upload
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import { copyToClipboard as copyTextToClipboard } from '$lib/utils/clipboard.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		ConfirmationModal,
		ModalWrapper,
		ModalHeader,
		ModalFooter
	} from '$lib/components/ui/modal';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

	let { data }: { data: PageData } = $props();

	// Tab state
	const activeTab = $derived($page.url.searchParams.get('tab') || 'general');

	function setTab(tab: string) {
		const url = new URL($page.url);
		url.searchParams.set('tab', tab);
		goto(url.toString(), { replaceState: true });
	}

	// =====================
	// API Keys State
	// =====================
	let showMainKey = $state(false);
	let showStreamingKey = $state(false);
	let copiedMain = $state(false);
	let copiedStreaming = $state(false);

	async function copyToClipboard(text: string, type: 'main' | 'streaming') {
		const copied = await copyTextToClipboard(text);
		if (!copied) {
			toasts.error(m.settings_system_failedToCopyApiKey());
			return;
		}

		if (type === 'main') {
			copiedMain = true;
			setTimeout(() => (copiedMain = false), 2000);
		} else {
			copiedStreaming = true;
			setTimeout(() => (copiedStreaming = false), 2000);
		}
	}

	function maskKey(key: string): string {
		if (!key) return '';
		const prefix = key.split('_')[0];
		return `${prefix}_${'•'.repeat(32)}`;
	}

	let regeneratingMain = $state(false);
	let regeneratingStreaming = $state(false);
	let confirmRegenerateOpen = $state(false);
	let regenerateTarget = $state<'main' | 'streaming'>('main');
	let generatingKeys = $state(false);

	async function generateApiKeys() {
		generatingKeys = true;

		try {
			const response = await fetch('/api/settings/system/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: m.settings_system_failedToGenerate() }));
				throw new Error(errorData.error || m.settings_system_failedToGenerateApiKeys());
			}

			const result = await response.json();

			if (result.success) {
				await invalidateAll();
				toasts.success(m.settings_system_apiKeysGenerated());
			}
		} catch (err) {
			toasts.error(
				err instanceof Error ? err.message : m.settings_system_failedToGenerateApiKeys()
			);
		} finally {
			generatingKeys = false;
		}
	}

	function promptRegenerate(type: 'main' | 'streaming') {
		regenerateTarget = type;
		confirmRegenerateOpen = true;
	}

	async function regenerateKey(type: 'main' | 'streaming') {
		confirmRegenerateOpen = false;
		const keyId = type === 'main' ? data.mainApiKey?.id : data.streamingApiKey?.id;
		const label =
			type === 'main' ? m.settings_system_mainLabel() : m.settings_system_mediaStreamingLabel();

		if (!keyId) {
			toasts.error(m.settings_system_noKeyToRegenerate({ label }));
			return;
		}

		if (type === 'main') regeneratingMain = true;
		else regeneratingStreaming = true;

		try {
			const response = await fetch(`/api/settings/system/api-keys/${keyId}/regenerate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: m.settings_system_failedToRegenerate() }));
				throw new Error(errorData.error || m.settings_system_failedToRegenerateKey({ label }));
			}

			const result = await response.json();

			if (result.success && result.data?.key) {
				await invalidateAll();
				if (type === 'main') showMainKey = true;
				else showStreamingKey = true;
				toasts.success(m.settings_system_keyRegenerated({ label }));
			}
		} catch (err) {
			toasts.error(
				err instanceof Error ? err.message : m.settings_system_failedToRegenerateKey({ label })
			);
		} finally {
			if (type === 'main') regeneratingMain = false;
			else regeneratingStreaming = false;
		}
	}

	// =====================
	// External URL State
	// =====================
	let externalUrl = $state('');
	let isSavingUrl = $state(false);
	let saveUrlSuccess = $state(false);
	let saveUrlError = $state('');

	$effect(() => {
		externalUrl = data.externalUrl || '';
	});

	async function saveExternalUrl() {
		isSavingUrl = true;
		saveUrlSuccess = false;
		saveUrlError = '';

		try {
			if (externalUrl && !isValidUrl(externalUrl)) {
				saveUrlError = m.settings_system_invalidUrlFormat();
				return;
			}

			const response = await fetch('/api/settings/external-url', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: externalUrl || null })
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: m.settings_system_failedToSave() }));
				throw new Error(errorData.error || m.settings_system_failedToSaveExternalUrl());
			}

			saveUrlSuccess = true;
			setTimeout(() => (saveUrlSuccess = false), 3000);
		} catch (err) {
			saveUrlError =
				err instanceof Error ? err.message : m.settings_system_failedToSaveExternalUrl();
		} finally {
			isSavingUrl = false;
		}
	}

	function isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return url.startsWith('http://') || url.startsWith('https://');
		} catch {
			return false;
		}
	}

	// =====================
	// Backup & Restore State
	// =====================
	type BackupSectionId =
		| 'system'
		| 'profiles'
		| 'downloads'
		| 'indexers'
		| 'subtitles'
		| 'integrations'
		| 'liveTv';

	interface BackupSectionPreview {
		id: BackupSectionId;
		label: string;
		tableNames: string[];
		totalRows: number;
		summary: string;
	}

	interface BackupPreview {
		version: number;
		createdAt: string;
		totalSections: number;
		includeIndexerCookies: boolean;
		supportsRestoreModes: string[];
		sections: BackupSectionPreview[];
	}

	const BACKUP_SECTION_GROUPS: BackupSectionPreview[] = [
		{
			id: 'system',
			label: 'System & Libraries',
			tableNames: [
				'settings',
				'monitoringSettings',
				'captchaSolverSettings',
				'taskSettings',
				'rootFolders',
				'libraries',
				'libraryRootFolders',
				'librarySettings',
				'namingSettings',
				'namingPresets'
			],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'profiles',
			label: 'Profiles & Formats',
			tableNames: [
				'scoringProfiles',
				'profileSizeLimits',
				'builtInProfileScoreOverrides',
				'customFormats',
				'delayProfiles',
				'languageProfiles'
			],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'downloads',
			label: 'Download Clients',
			tableNames: ['downloadClients', 'nntpServers'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'indexers',
			label: 'Indexers',
			tableNames: ['indexers'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'subtitles',
			label: 'Subtitles',
			tableNames: ['subtitleProviders', 'subtitleSettings'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'integrations',
			label: 'External Integrations',
			tableNames: ['mediaBrowserServers', 'smartLists'],
			totalRows: 0,
			summary: ''
		},
		{
			id: 'liveTv',
			label: 'Live TV',
			tableNames: [
				'stalkerPortals',
				'livetvAccounts',
				'channelCategories',
				'channelLineupItems',
				'channelLineupBackups'
			],
			totalRows: 0,
			summary: ''
		}
	];

	function pluralize(count: number, singular: string, plural = `${singular}s`): string {
		return `${count} ${count === 1 ? singular : plural}`;
	}

	function summarizeBackupSection(
		sectionId: BackupSectionId,
		totalRows: number,
		countsByTable: Record<string, number>
	): string {
		const joinNonZero = (parts: string[]) => parts.filter(Boolean).join(', ');

		switch (sectionId) {
			case 'system':
				return pluralize(totalRows, 'system and library setting');
			case 'profiles':
				return joinNonZero([
					countsByTable.scoringProfiles
						? pluralize(countsByTable.scoringProfiles, 'scoring profile')
						: '',
					countsByTable.customFormats
						? pluralize(countsByTable.customFormats, 'custom format')
						: '',
					countsByTable.languageProfiles
						? pluralize(countsByTable.languageProfiles, 'language profile')
						: '',
					countsByTable.delayProfiles ? pluralize(countsByTable.delayProfiles, 'delay profile') : ''
				]);
			case 'downloads':
				return joinNonZero([
					countsByTable.downloadClients ? pluralize(countsByTable.downloadClients, 'client') : '',
					countsByTable.nntpServers ? pluralize(countsByTable.nntpServers, 'NNTP server') : ''
				]);
			case 'indexers':
				return `${pluralize(totalRows, 'indexer')} configured`;
			case 'subtitles':
				return joinNonZero([
					countsByTable.subtitleProviders
						? pluralize(countsByTable.subtitleProviders, 'provider')
						: '',
					countsByTable.subtitleSettings ? pluralize(countsByTable.subtitleSettings, 'setting') : ''
				]);
			case 'integrations':
				return joinNonZero([
					countsByTable.mediaBrowserServers
						? pluralize(countsByTable.mediaBrowserServers, 'media server')
						: '',
					countsByTable.smartLists ? pluralize(countsByTable.smartLists, 'smart list') : ''
				]);
			case 'liveTv':
				return joinNonZero([
					countsByTable.stalkerPortals ? pluralize(countsByTable.stalkerPortals, 'portal') : '',
					countsByTable.livetvAccounts ? pluralize(countsByTable.livetvAccounts, 'account') : '',
					countsByTable.channelCategories
						? pluralize(countsByTable.channelCategories, 'category')
						: '',
					countsByTable.channelLineupItems
						? pluralize(countsByTable.channelLineupItems, 'lineup item')
						: '',
					countsByTable.channelLineupBackups
						? pluralize(countsByTable.channelLineupBackups, 'lineup backup')
						: ''
				]);
		}
	}

	let backupExportPassphrase = $state('');
	let backupIncludeIndexerCookies = $state(false);
	let backupImportPassphrase = $state('');
	let backupExporting = $state(false);
	let backupImporting = $state(false);
	let confirmRestoreOpen = $state(false);
	let selectedBackupFile = $state<File | null>(null);
	let backupPreview = $state<BackupPreview | null>(null);
	let backupMessage = $state<string | null>(null);
	let backupError = $state<string | null>(null);
	let backupWarnings = $state<string[]>([]);
	let selectedRestoreSections = $state<BackupSectionId[]>([]);

	function buildBackupPreview(backup: unknown): BackupPreview {
		if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
			throw new Error('Invalid backup file');
		}

		const candidate = backup as Record<string, unknown>;
		const data = candidate.data;
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			throw new Error('Backup file is missing configuration data');
		}

		const manifest = candidate.manifest;
		if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
			const typedManifest = manifest as Record<string, unknown>;
			const sections = Array.isArray(typedManifest.sections)
				? typedManifest.sections
						.filter(
							(section): section is Record<string, unknown> =>
								!!section && typeof section === 'object'
						)
						.map((section) => {
							const tableNames = Array.isArray(section.tableNames)
								? section.tableNames.map((name) => String(name))
								: [];
							const sectionId = String(section.id) as BackupSectionId;
							const countsByTable = Object.fromEntries(
								tableNames.map((tableName) => [
									tableName,
									Array.isArray((data as Record<string, unknown>)[tableName])
										? ((data as Record<string, unknown>)[tableName] as unknown[]).length
										: 0
								])
							);

							return {
								id: sectionId,
								label: String(section.label),
								tableNames,
								totalRows: typeof section.totalRows === 'number' ? section.totalRows : 0,
								summary: summarizeBackupSection(
									sectionId,
									typeof section.totalRows === 'number' ? section.totalRows : 0,
									countsByTable
								)
							};
						})
				: [];

			return {
				version: typeof candidate.version === 'number' ? candidate.version : 1,
				createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
				totalSections: sections.filter((section) => section.totalRows > 0).length,
				includeIndexerCookies:
					!!candidate.options &&
					typeof candidate.options === 'object' &&
					!Array.isArray(candidate.options) &&
					!!(candidate.options as Record<string, unknown>).includeIndexerCookies,
				supportsRestoreModes: Array.isArray(typedManifest.supportsRestoreModes)
					? typedManifest.supportsRestoreModes.map((mode) => String(mode))
					: ['apply'],
				sections
			};
		}

		const dataRecord = data as Record<string, unknown>;
		const sections = BACKUP_SECTION_GROUPS.map((section) => {
			const countsByTable = Object.fromEntries(
				section.tableNames.map((tableName) => [
					tableName,
					Array.isArray(dataRecord[tableName]) ? (dataRecord[tableName] as unknown[]).length : 0
				])
			);
			const totalRows = Object.values(countsByTable).reduce<number>((sum, count) => sum + count, 0);

			return {
				...section,
				totalRows,
				summary: summarizeBackupSection(section.id, totalRows, countsByTable)
			};
		});

		return {
			version: typeof candidate.version === 'number' ? candidate.version : 1,
			createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
			totalSections: sections.filter((section) => section.totalRows > 0).length,
			includeIndexerCookies: false,
			supportsRestoreModes: ['apply'],
			sections
		};
	}

	async function handleBackupFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectedBackupFile = input.files?.[0] ?? null;
		backupError = null;
		backupMessage = null;
		backupWarnings = [];
		backupPreview = null;

		if (!selectedBackupFile) {
			selectedRestoreSections = [];
			return;
		}

		try {
			const backup = JSON.parse(await selectedBackupFile.text());
			backupPreview = buildBackupPreview(backup);
			selectedRestoreSections = backupPreview.sections
				.filter((section) => section.totalRows > 0)
				.map((section) => section.id);
		} catch (error) {
			selectedBackupFile = null;
			selectedRestoreSections = [];
			backupError = error instanceof Error ? error.message : 'Failed to read backup file';
		}
	}

	function toggleRestoreSection(sectionId: BackupSectionId, checked: boolean) {
		if (checked) {
			if (!selectedRestoreSections.includes(sectionId)) {
				selectedRestoreSections = [...selectedRestoreSections, sectionId];
			}
			return;
		}

		selectedRestoreSections = selectedRestoreSections.filter((section) => section !== sectionId);
	}

	async function exportConfigurationBackup() {
		backupExporting = true;
		backupError = null;
		backupMessage = null;
		backupWarnings = [];

		try {
			const response = await fetch('/api/settings/system/backup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passphrase: backupExportPassphrase,
					includeIndexerCookies: backupIncludeIndexerCookies
				})
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(getResponseErrorMessage(payload, 'Failed to export configuration backup'));
			}

			if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
				throw new Error('Invalid backup export response');
			}

			const backup = payload.backup;
			const fileName =
				typeof payload.fileName === 'string' ? payload.fileName : 'cinephage-config-backup.json';
			const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = fileName;
			anchor.click();
			URL.revokeObjectURL(url);

			backupMessage = 'Configuration backup exported successfully.';
		} catch (error) {
			backupError =
				error instanceof Error ? error.message : 'Failed to export configuration backup';
		} finally {
			backupExporting = false;
		}
	}

	async function importConfigurationBackup() {
		if (!selectedBackupFile) {
			backupError = 'Select a backup file first.';
			return;
		}

		if (selectedRestoreSections.length === 0) {
			backupError = 'Select at least one backup section to restore.';
			return;
		}

		if (!backupImportPassphrase.trim()) {
			backupError = 'Backup passphrase is required for restore.';
			return;
		}

		confirmRestoreOpen = false;
		backupImporting = true;
		backupError = null;
		backupMessage = null;
		backupWarnings = [];

		try {
			const backup = JSON.parse(await selectedBackupFile.text());
			const response = await fetch('/api/settings/system/backup', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passphrase: backupImportPassphrase.trim(),
					sections: selectedRestoreSections,
					mode: 'apply',
					backup
				})
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(getResponseErrorMessage(payload, 'Failed to restore configuration backup'));
			}

			const result =
				payload && typeof payload === 'object' && !Array.isArray(payload)
					? payload.result
					: undefined;
			const resultRecord =
				result && typeof result === 'object' && !Array.isArray(result)
					? (result as Record<string, unknown>)
					: null;
			const warningCandidates = resultRecord?.warnings;
			backupWarnings = Array.isArray(warningCandidates)
				? warningCandidates.filter(
						(warning: unknown): warning is string => typeof warning === 'string'
					)
				: [];
			backupMessage =
				backupWarnings.length > 0
					? 'Configuration restored with warnings.'
					: 'Configuration restored successfully.';
			selectedBackupFile = null;
			backupPreview = null;
			selectedRestoreSections = [];
			await invalidateAll();
		} catch (error) {
			backupError =
				error instanceof Error ? error.message : 'Failed to restore configuration backup';
		} finally {
			backupImporting = false;
		}
	}

	function promptRestoreConfiguration() {
		if (!selectedBackupFile) {
			backupError = 'Select a backup file first.';
			return;
		}

		if (selectedRestoreSections.length === 0) {
			backupError = 'Select at least one backup section to restore.';
			return;
		}

		if (!backupImportPassphrase.trim()) {
			backupError = 'Backup passphrase is required for restore.';
			return;
		}

		backupError = null;
		confirmRestoreOpen = true;
	}

	// =====================
	// TMDB Config State
	// =====================
	let tmdbModalOpen = $state(false);
	let tmdbApiKey = $state('');
	let tmdbSaving = $state(false);
	let tmdbError = $state<string | null>(null);

	function openTmdbModal() {
		tmdbApiKey = '';
		tmdbError = null;
		tmdbModalOpen = true;
	}

	function closeTmdbModal() {
		tmdbError = null;
		tmdbModalOpen = false;

		const url = new URL($page.url);
		if (url.searchParams.get('open') === 'tmdb') {
			url.searchParams.delete('open');
			goto(url.toString(), { replaceState: true, noScroll: true });
		}
	}

	async function handleTmdbSave() {
		tmdbSaving = true;
		tmdbError = null;

		try {
			const response = await fetch('/api/settings/tmdb', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ apiKey: tmdbApiKey })
			});

			const payload = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				tmdbError = getResponseErrorMessage(payload, 'Failed to save TMDB API key');
				return;
			}

			await invalidateAll();
			toasts.success(m.settings_integrations_tmdbKeySaved());
			closeTmdbModal();
		} catch (error) {
			tmdbError = error instanceof Error ? error.message : 'Failed to save TMDB API key';
		} finally {
			tmdbSaving = false;
		}
	}

	// =====================
	// Captcha Solver State
	// =====================
	interface SolverHealth {
		available: boolean;
		status: 'ready' | 'busy' | 'error' | 'disabled' | 'initializing';
		browserAvailable: boolean;
		error?: string;
		stats: {
			totalAttempts: number;
			successCount: number;
			failureCount: number;
			cacheHits: number;
			avgSolveTimeMs: number;
			cacheSize: number;
			fetchAttempts: number;
			fetchSuccessCount: number;
			fetchFailureCount: number;
			avgFetchTimeMs: number;
			lastSolveAt?: string;
			lastFetchAt?: string;
			lastError?: string;
		};
	}

	interface SolverSettings {
		enabled: boolean;
		timeoutSeconds: number;
		cacheTtlSeconds: number;
		headless: boolean;
		proxyUrl: string;
		proxyUsername: string;
		proxyPassword: string;
	}

	let captchaLoading = $state(true);
	let captchaSaving = $state(false);
	let captchaTesting = $state(false);
	let captchaClearing = $state(false);
	let health = $state<SolverHealth | null>(null);
	let captchaSettings = $state<SolverSettings>({
		enabled: false,
		timeoutSeconds: 60,
		cacheTtlSeconds: 3600,
		headless: true,
		proxyUrl: '',
		proxyUsername: '',
		proxyPassword: ''
	});
	let testUrl = $state('');
	let testResult = $state<{ success: boolean; message: string } | null>(null);
	let captchaSaveError = $state<string | null>(null);
	let captchaSaveSuccess = $state(false);

	// Load captcha data when the tab is active
	let captchaDataLoaded = $state(false);

	$effect(() => {
		if (activeTab === 'captcha' && !captchaDataLoaded) {
			loadCaptchaData();
			captchaDataLoaded = true;
		}
	});

	$effect(() => {
		const shouldOpenTmdbModal =
			activeTab === 'tmdb' && $page.url.searchParams.get('open') === 'tmdb';
		if (shouldOpenTmdbModal && !tmdbModalOpen) {
			openTmdbModal();
		}
	});

	// Poll while initializing
	$effect(() => {
		if (health?.status !== 'initializing') return;

		const pollInterval = setInterval(async () => {
			try {
				const res = await fetch('/api/captcha-solver/health');
				if (res.ok) {
					const data = await res.json();
					health = data.health;
				}
			} catch {
				// Ignore errors during polling
			}
		}, 2000);

		return () => clearInterval(pollInterval);
	});

	async function loadCaptchaData() {
		captchaLoading = true;
		try {
			const [healthRes, settingsRes] = await Promise.all([
				fetch('/api/captcha-solver/health'),
				fetch('/api/captcha-solver')
			]);

			if (healthRes.ok) {
				const data = await healthRes.json();
				health = data.health;
			}

			if (settingsRes.ok) {
				const data = await settingsRes.json();
				captchaSettings = data.settings;
			}
		} catch (error) {
			toasts.error(m.settings_integrations_captcha_failedToLoad(), {
				description:
					error instanceof Error ? error.message : m.settings_integrations_captcha_failedToLoad()
			});
		} finally {
			captchaLoading = false;
		}
	}

	async function saveCaptchaSettings() {
		captchaSaving = true;
		captchaSaveError = null;
		captchaSaveSuccess = false;

		try {
			const response = await fetch('/api/captcha-solver', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(captchaSettings)
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				captchaSaveError = result.error || 'Failed to save settings';
				return;
			}

			captchaSettings = result.settings;
			captchaSaveSuccess = true;
			await loadCaptchaData();

			setTimeout(() => {
				captchaSaveSuccess = false;
			}, 3000);
		} catch (error) {
			captchaSaveError = error instanceof Error ? error.message : 'Failed to save settings';
		} finally {
			captchaSaving = false;
		}
	}

	async function testSolver() {
		if (!testUrl) return;
		captchaTesting = true;
		testResult = null;

		try {
			const response = await fetch('/api/captcha-solver/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: testUrl })
			});

			const result = await response.json();

			if (result.success) {
				if (result.hasChallenge) {
					testResult = {
						success: true,
						message: `Solved ${result.challengeType} challenge in ${result.solveTimeMs}ms`
					};
				} else {
					testResult = {
						success: true,
						message: result.message || 'No challenge detected for this URL'
					};
				}
			} else {
				testResult = {
					success: false,
					message: result.error || 'Test failed'
				};
			}

			await loadCaptchaData();
		} catch (error) {
			testResult = {
				success: false,
				message: error instanceof Error ? error.message : 'Test failed'
			};
		} finally {
			captchaTesting = false;
		}
	}

	async function clearCache() {
		captchaClearing = true;
		try {
			const response = await fetch('/api/captcha-solver/health', {
				method: 'DELETE'
			});

			if (response.ok) {
				await loadCaptchaData();
			}
		} catch (error) {
			toasts.error(m.settings_integrations_captcha_failedToClearCache(), {
				description:
					error instanceof Error
						? error.message
						: m.settings_integrations_captcha_failedToClearCache()
			});
		} finally {
			captchaClearing = false;
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function getSuccessRate(): string {
		if (!health?.stats.totalAttempts) return '0%';
		const rate = (health.stats.successCount / health.stats.totalAttempts) * 100;
		return `${rate.toFixed(1)}%`;
	}

	function getFetchSuccessRate(): string {
		if (!health?.stats.fetchAttempts) return '0%';
		const rate = (health.stats.fetchSuccessCount / health.stats.fetchAttempts) * 100;
		return `${rate.toFixed(1)}%`;
	}
</script>

<svelte:head>
	<title>{m.settings_system_pageTitle()}</title>
</svelte:head>

<SettingsPage title={m.settings_system_heading()} subtitle={m.settings_system_subtitle()}>
	<!-- Tab navigation -->
	<div role="tablist" class="tabs-boxed tabs flex flex-wrap gap-2">
		<button
			role="tab"
			class="tab h-auto min-h-0 flex-1 items-center justify-center gap-2 px-3 py-2 sm:flex-none sm:justify-start"
			class:tab-active={activeTab === 'general'}
			onclick={() => setTab('general')}
		>
			<Server class="h-4 w-4 shrink-0" />
			{m.nav_general()}
		</button>
		<button
			role="tab"
			class="tab h-auto min-h-0 flex-1 items-center justify-center gap-2 px-3 py-2 sm:flex-none sm:justify-start"
			class:tab-active={activeTab === 'tmdb'}
			onclick={() => setTab('tmdb')}
		>
			<Film class="h-4 w-4 shrink-0" />
			TMDB
		</button>
		<button
			role="tab"
			class="tab h-auto min-h-0 flex-1 items-center justify-center gap-2 px-3 py-2 sm:flex-none sm:justify-start"
			class:tab-active={activeTab === 'captcha'}
			onclick={() => setTab('captcha')}
		>
			<Shield class="h-4 w-4" />
			{m.nav_captchaSolver()}
		</button>
		<button
			role="tab"
			class="tab h-auto min-h-0 flex-1 gap-2 px-3 py-2 sm:flex-none"
			class:tab-active={activeTab === 'backup'}
			onclick={() => setTab('backup')}
		>
			<Download class="h-4 w-4" />
			Backup & Restore
		</button>
	</div>

	<!-- General Tab: API Keys + External URL -->
	{#if activeTab === 'general'}
		<!-- API Authentication Section -->
		<SettingsSection
			title={m.settings_system_apiAuth()}
			description={m.settings_system_apiAuthDescription()}
		>
			{#if !data.mainApiKey && !data.streamingApiKey}
				<div class="alert alert-info">
					<AlertCircle class="h-5 w-5" />
					<div class="flex flex-col gap-2">
						<span>{m.settings_system_noApiKeys()}</span>
						<button
							class="btn w-fit btn-sm btn-primary"
							onclick={generateApiKeys}
							disabled={generatingKeys}
						>
							{#if generatingKeys}
								<RefreshCw class="h-4 w-4 animate-spin" />
								{m.settings_system_generating()}
							{:else}
								<Key class="h-4 w-4" />
								{m.settings_system_generateApiKeys()}
							{/if}
						</button>
					</div>
				</div>
			{/if}

			<!-- Main API Key -->
			<div class="rounded-lg bg-base-100 p-4">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-center gap-2">
						<Key class="h-5 w-5" />
						<h3 class="text-base font-semibold">{m.settings_system_mainApiKey()}</h3>
					</div>
					<span class="badge badge-primary">{m.settings_system_fullAccess()}</span>
				</div>

				<div class="mt-4">
					<label class="label" for="system-main-api-key">
						<span class="label-text">{m.settings_system_apiKeyLabel()}</span>
					</label>
					<div class="join w-full">
						<input
							id="system-main-api-key"
							type="text"
							class="input-bordered input join-item w-full font-mono"
							value={showMainKey ? data.mainApiKey?.key : maskKey(data.mainApiKey?.key || '')}
							readonly
						/>
						<button
							class="btn join-item btn-ghost"
							onclick={() => (showMainKey = !showMainKey)}
							title={showMainKey ? m.settings_system_hideKey() : m.settings_system_showKey()}
						>
							{#if showMainKey}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
						<button
							class="btn join-item btn-ghost"
							onclick={() => data.mainApiKey?.key && copyToClipboard(data.mainApiKey.key, 'main')}
							title={m.settings_system_copyToClipboard()}
							disabled={!data.mainApiKey?.key}
						>
							{#if copiedMain}
								<Check class="h-4 w-4 text-success" />
							{:else}
								<Copy class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<div
					class="mt-3 flex flex-col gap-3 text-sm text-base-content/70 sm:flex-row sm:items-center sm:justify-between"
				>
					<span
						>{m.settings_system_created()}: {data.mainApiKey?.createdAt
							? new Date(data.mainApiKey.createdAt).toLocaleDateString()
							: m.common_na()}</span
					>
					<button
						class="btn gap-2 btn-sm btn-warning"
						onclick={() => promptRegenerate('main')}
						disabled={regeneratingMain || regeneratingStreaming}
					>
						{#if regeneratingMain}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.settings_system_regenerating()}
						{:else}
							<RefreshCw class="h-4 w-4" />
							{m.settings_system_regenerate()}
						{/if}
					</button>
				</div>
			</div>

			<!-- Media Streaming API Key -->
			<div class="rounded-lg bg-base-100 p-4">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-center gap-2">
						<Server class="h-5 w-5" />
						<h3 class="text-base font-semibold">{m.settings_system_mediaStreamingApiKey()}</h3>
					</div>
					<span class="badge badge-secondary">{m.settings_system_liveTvStreaming()}</span>
				</div>

				<p class="mt-2 text-sm text-base-content/70">
					{m.settings_system_mediaStreamingDescription()}
				</p>

				<div class="mt-4">
					<label class="label" for="system-streaming-api-key">
						<span class="label-text">{m.settings_system_apiKeyLabel()}</span>
					</label>
					<div class="join w-full">
						<input
							id="system-streaming-api-key"
							type="text"
							class="input-bordered input join-item w-full font-mono"
							value={showStreamingKey
								? data.streamingApiKey?.key
								: maskKey(data.streamingApiKey?.key || '')}
							readonly
						/>
						<button
							class="btn join-item btn-ghost"
							onclick={() => (showStreamingKey = !showStreamingKey)}
							title={showStreamingKey ? m.settings_system_hideKey() : m.settings_system_showKey()}
						>
							{#if showStreamingKey}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
						<button
							class="btn join-item btn-ghost"
							onclick={() =>
								data.streamingApiKey?.key && copyToClipboard(data.streamingApiKey.key, 'streaming')}
							title={m.settings_system_copyToClipboard()}
							disabled={!data.streamingApiKey?.key}
						>
							{#if copiedStreaming}
								<Check class="h-4 w-4 text-success" />
							{:else}
								<Copy class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="mt-2 text-sm text-base-content/70">
					<div class="mb-2 font-semibold">{m.settings_system_permissions()}:</div>
					<ul class="list-inside list-disc space-y-1">
						<li class="text-success">{m.settings_system_permM3u()}</li>
						<li class="text-success">{m.settings_system_permEpg()}</li>
						<li class="text-success">{m.settings_system_permLiveTvStreams()}</li>
						<li class="text-success">{m.settings_system_permStreamingContent()}</li>
						<li class="text-error">{m.settings_system_permNoLibrary()}</li>
						<li class="text-error">{m.settings_system_permNoSettings()}</li>
					</ul>
				</div>

				<div
					class="mt-3 flex flex-col gap-3 text-sm text-base-content/70 sm:flex-row sm:items-center sm:justify-between"
				>
					<span
						>{m.settings_system_created()}: {data.streamingApiKey?.createdAt
							? new Date(data.streamingApiKey.createdAt).toLocaleDateString()
							: m.common_na()}</span
					>
					<button
						class="btn gap-2 btn-sm btn-warning"
						onclick={() => promptRegenerate('streaming')}
						disabled={regeneratingMain || regeneratingStreaming}
					>
						{#if regeneratingStreaming}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.settings_system_regenerating()}
						{:else}
							<RefreshCw class="h-4 w-4" />
							{m.settings_system_regenerate()}
						{/if}
					</button>
				</div>
			</div>
		</SettingsSection>

		<!-- External URL Section -->
		<SettingsSection
			title={m.settings_system_externalUrl()}
			description={m.settings_system_externalUrlDescription()}
		>
			<div class="rounded-lg bg-base-100 p-4">
				<p class="text-sm text-base-content/70">
					{m.settings_system_publicUrlHint()}
				</p>

				<div class="mt-4">
					<label class="label" for="externalUrl">
						<span class="label-text">{m.settings_system_externalUrl()}</span>
					</label>
					<input
						id="externalUrl"
						type="url"
						class="input-bordered input w-full"
						placeholder="https://cinephage.yourdomain.com"
						bind:value={externalUrl}
					/>
					{#if saveUrlError}
						<div class="mt-2 flex items-center gap-2 text-sm text-error">
							<AlertCircle class="h-4 w-4" />
							<span>{saveUrlError}</span>
						</div>
					{/if}
					{#if saveUrlSuccess}
						<div class="mt-2 flex items-center gap-2 text-sm text-success">
							<Check class="h-4 w-4" />
							<span>{m.settings_system_externalUrlSaved()}</span>
						</div>
					{/if}
				</div>

				<div class="mt-4 text-sm text-base-content/70">
					<div class="mb-2 font-semibold">{m.settings_system_examples()}:</div>
					<ul class="list-inside list-disc space-y-1">
						<li>{m.settings_system_exampleReverseProxy()}</li>
						<li>{m.settings_system_exampleSubpath()}</li>
						<li>{m.settings_system_exampleEmpty()}</li>
					</ul>
				</div>

				<div class="mt-4 flex justify-end">
					<button
						class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
						onclick={saveExternalUrl}
						disabled={isSavingUrl}
					>
						{#if isSavingUrl}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.common_saving()}
						{:else}
							<Check class="h-4 w-4" />
							{m.settings_system_saveExternalUrl()}
						{/if}
					</button>
				</div>
			</div>
		</SettingsSection>
	{/if}

	<!-- TMDB Tab -->
	{#if activeTab === 'tmdb'}
		<SettingsSection
			title={m.settings_integrations_tmdbTitle()}
			description={m.settings_integrations_tmdbDescription()}
		>
			<div class="flex items-center gap-3">
				{#if data.tmdb.hasApiKey}
					<div class="badge gap-1 badge-success">
						<CheckCircle class="h-3 w-3" />
						{m.settings_integrations_configured()}
					</div>
				{:else}
					<div class="badge gap-1 badge-warning">
						<AlertCircle class="h-3 w-3" />
						{m.settings_integrations_notConfigured()}
					</div>
				{/if}
				<button onclick={openTmdbModal} class="btn gap-1 btn-sm btn-primary">
					{m.action_configure()}
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>

			<div class="alert alert-info">
				<AlertCircle class="h-5 w-5" />
				<div>
					<p class="text-sm">
						{m.settings_integrations_tmdbApiKeyDescription()}
						<a
							href="https://www.themoviedb.org/settings/api"
							target="_blank"
							class="link link-primary"
						>
							themoviedb.org
						</a>.
					</p>
				</div>
			</div>
		</SettingsSection>
	{/if}

	{#if activeTab === 'backup'}
		<SettingsSection
			title="Backup & Restore"
			description="Export your Cinephage configuration for disaster recovery and restore it later with the same passphrase."
		>
			<div class="alert overflow-hidden alert-info">
				<AlertCircle class="h-5 w-5" />
				<div class="min-w-0">
					<p class="font-medium">Configuration backup only</p>
					<p class="text-sm wrap-break-word">
						Backups include user-managed settings and encrypted user-supplied credentials. Runtime
						caches, queues, task history, and generated system API keys are excluded. Indexer
						session cookies can be included explicitly as an advanced option.
					</p>
				</div>
			</div>

			{#if backupError}
				<div class="alert alert-error">
					<AlertCircle class="h-4 w-4" />
					<span>{backupError}</span>
				</div>
			{/if}

			{#if backupWarnings.length > 0}
				<div class="alert alert-warning">
					<AlertCircle class="h-4 w-4" />
					<div class="space-y-1">
						<div class="font-medium">Restore warnings</div>
						<ul class="list-inside list-disc text-sm">
							{#each backupWarnings as warning (warning)}
								<li>{warning}</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}

			{#if backupMessage}
				<div class="alert alert-success">
					<CheckCircle class="h-4 w-4" />
					<span>{backupMessage}</span>
				</div>
			{/if}

			<div class="grid gap-4 lg:grid-cols-2">
				<div class="min-w-0 overflow-hidden rounded-lg bg-base-100 p-4">
					<div class="mb-3 flex items-center gap-2">
						<Download class="h-5 w-5" />
						<h3 class="text-base font-semibold">Export configuration</h3>
					</div>

					<p class="mb-4 text-sm wrap-break-word text-base-content/70">
						Exports configuration for settings, integrations, indexers, download clients, profiles,
						and other user-managed setup required to rebuild the instance.
					</p>

					<label
						class="label flex-wrap items-start gap-2 whitespace-normal"
						for="backup-export-passphrase"
					>
						<span class="label-text">Encryption passphrase</span>
					</label>
					<input
						id="backup-export-passphrase"
						type="password"
						class="input-bordered input w-full"
						placeholder="At least 16 characters to encrypt exported secrets"
						bind:value={backupExportPassphrase}
					/>

					<label class="label mt-4 cursor-pointer justify-start gap-3 whitespace-normal">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							bind:checked={backupIncludeIndexerCookies}
						/>
						<div class="min-w-0">
							<span class="label-text font-medium">Include indexer session cookies</span>
							<p class="text-sm wrap-break-word text-base-content/70">
								Back up active 2FA/session cookies for indexers that rely on them. These are
								encrypted, short-lived, and more sensitive than saved credentials.
							</p>
						</div>
					</label>

					<div class="mt-4 flex justify-end">
						<button
							class="btn w-full gap-2 btn-primary sm:w-auto"
							onclick={exportConfigurationBackup}
							disabled={backupExporting || backupExportPassphrase.trim().length < 16}
						>
							{#if backupExporting}
								<RefreshCw class="h-4 w-4 animate-spin" />
								Exporting...
							{:else}
								<Download class="h-4 w-4" />
								Export backup
							{/if}
						</button>
					</div>
				</div>

				<div class="min-w-0 overflow-hidden rounded-lg bg-base-100 p-4">
					<div class="mb-3 flex items-center gap-2">
						<Upload class="h-5 w-5" />
						<h3 class="text-base font-semibold">Restore configuration</h3>
					</div>

					<p class="mb-4 text-sm wrap-break-word text-base-content/70">
						Restoring applies the saved configuration from the backup file to this instance. Use the
						same passphrase that was used during export.
					</p>

					<label
						class="label flex-wrap items-start gap-2 whitespace-normal"
						for="backup-restore-file"
					>
						<span class="label-text">Backup file</span>
					</label>
					<input
						id="backup-restore-file"
						type="file"
						class="file-input-bordered file-input w-full max-w-full min-w-0"
						accept="application/json,.json"
						onchange={handleBackupFileChange}
					/>

					{#if backupPreview}
						<div class="mt-4 min-w-0 overflow-hidden rounded-lg border border-base-300 p-4">
							<div
								class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
							>
								<div class="min-w-0">
									<div class="font-medium">Backup preview</div>
									<div class="text-sm wrap-break-word text-base-content/70">
										Version {backupPreview.version}
										{#if backupPreview.createdAt}
											• {new Date(backupPreview.createdAt).toLocaleString()}
										{/if}
									</div>
								</div>
								<div class="text-right text-sm text-base-content/70">
									<div>{pluralize(backupPreview.totalSections, 'section')}</div>
								</div>
							</div>

							<div class="space-y-2">
								<div class="text-sm font-medium">Restore sections</div>
								{#each backupPreview.sections.filter((section) => section.totalRows > 0) as section (section.id)}
									<label
										class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3"
									>
										<input
											type="checkbox"
											class="checkbox mt-0.5 checkbox-sm"
											checked={selectedRestoreSections.includes(section.id)}
											onchange={(event) =>
												toggleRestoreSection(
													section.id,
													(event.currentTarget as HTMLInputElement).checked
												)}
										/>
										<div class="min-w-0">
											<div class="font-medium">{section.label}</div>
											<div class="text-sm text-base-content/70">
												{section.summary}
											</div>
										</div>
									</label>
								{/each}
							</div>

							{#if backupPreview.includeIndexerCookies}
								<div class="mt-4 alert overflow-hidden alert-warning">
									<AlertCircle class="h-4 w-4" />
									<span class="wrap-break-word">
										This backup includes encrypted indexer session cookies. Restoring it will try to
										reuse active indexer sessions where they are still valid.
									</span>
								</div>
							{/if}
						</div>
					{/if}

					<label
						class="label mt-3 flex-wrap items-start gap-2 whitespace-normal"
						for="backup-import-passphrase"
					>
						<span class="label-text">Backup passphrase</span>
					</label>
					<input
						id="backup-import-passphrase"
						type="password"
						class="input-bordered input w-full"
						placeholder="Required to decrypt exported secrets"
						bind:value={backupImportPassphrase}
					/>

					<div class="mt-4 flex justify-end">
						<button
							class="btn w-full gap-2 btn-warning sm:w-auto"
							onclick={promptRestoreConfiguration}
							disabled={backupImporting ||
								!selectedBackupFile ||
								selectedRestoreSections.length === 0 ||
								!backupImportPassphrase.trim()}
						>
							{#if backupImporting}
								<RefreshCw class="h-4 w-4 animate-spin" />
								Restoring...
							{:else}
								<Upload class="h-4 w-4" />
								Restore backup
							{/if}
						</button>
					</div>
				</div>
			</div>
		</SettingsSection>
	{/if}

	<!-- Captcha Tab -->
	{#if activeTab === 'captcha'}
		{#if captchaLoading}
			<div class="flex items-center justify-center py-12">
				<RefreshCw class="h-6 w-6 animate-spin text-primary" />
			</div>
		{:else}
			<!-- Status Banner -->
			<div>
				{#if health?.status === 'initializing'}
					<div class="alert flex items-center gap-2 alert-info">
						<RefreshCw class="h-5 w-5 animate-spin" />
						<div>
							<span class="font-medium">{m.settings_integrations_captcha_statusInitializing()}</span
							>
							<p class="text-sm">{m.settings_integrations_captcha_statusInitializingDesc()}</p>
						</div>
					</div>
				{:else if health?.available}
					<div class="alert flex items-center gap-2 alert-success">
						<CheckCircle class="h-5 w-5" />
						<span>{m.settings_integrations_captcha_statusReady()}</span>
						{#if health.status === 'busy'}
							<span class="badge badge-warning">{m.settings_integrations_captcha_statusBusy()}</span
							>
						{/if}
					</div>
				{:else if captchaSettings.enabled && !health?.browserAvailable}
					<div class="alert flex items-center gap-2 alert-error">
						<XCircle class="h-5 w-5" />
						<div>
							<span class="font-medium"
								>{m.settings_integrations_captcha_browserNotAvailable()}</span
							>
							<p class="text-sm">
								{health?.error || m.settings_integrations_captcha_browserNotAvailableDesc()}
							</p>
						</div>
					</div>
				{:else}
					<div class="alert flex items-center gap-2 alert-warning">
						<AlertCircle class="h-5 w-5" />
						<span>{m.settings_integrations_captcha_statusDisabled()}</span>
					</div>
				{/if}
			</div>

			<!-- Captcha Settings -->
			<SettingsSection
				title={m.nav_settings()}
				description={m.settings_integrations_captcha_subtitle()}
			>
				{#if captchaSaveError}
					<div class="alert alert-error">
						<XCircle class="h-4 w-4" />
						<span>{captchaSaveError}</span>
					</div>
				{/if}

				{#if captchaSaveSuccess}
					<div class="alert alert-success">
						<CheckCircle class="h-4 w-4" />
						<span>{m.settings_integrations_captcha_settingsSaved()}</span>
					</div>
				{/if}

				<div class="space-y-6">
					<!-- Enable Toggle -->
					<div class="form-control">
						<label
							class="label w-full cursor-pointer items-start justify-start gap-3 py-0 whitespace-normal"
						>
							<input
								type="checkbox"
								bind:checked={captchaSettings.enabled}
								class="toggle mt-0.5 shrink-0 toggle-primary"
							/>
							<div class="min-w-0">
								<span class="label-text block font-medium whitespace-normal">
									{m.settings_integrations_captcha_enableLabel()}
								</span>
								<p
									class="text-sm leading-relaxed wrap-break-word whitespace-normal text-base-content/60"
								>
									{m.settings_integrations_captcha_enableDesc()}
								</p>
							</div>
						</label>
					</div>

					<!-- Headless Mode -->
					<div class="form-control">
						<label
							class="label w-full cursor-pointer items-start justify-start gap-3 py-0 whitespace-normal"
						>
							<input
								type="checkbox"
								bind:checked={captchaSettings.headless}
								class="toggle mt-0.5 shrink-0 toggle-secondary"
								disabled={!captchaSettings.enabled}
							/>
							<div class="min-w-0">
								<span class="label-text block font-medium whitespace-normal">
									{m.settings_integrations_captcha_headlessLabel()}
								</span>
								<p
									class="text-sm leading-relaxed wrap-break-word whitespace-normal text-base-content/60"
								>
									{m.settings_integrations_captcha_headlessDesc()}
								</p>
							</div>
						</label>
					</div>

					<div class="divider text-sm">{m.settings_integrations_captcha_timing()}</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<!-- Timeout -->
						<div class="form-control w-full min-w-0">
							<label class="label flex-wrap items-start gap-2 whitespace-normal" for="timeout">
								<span class="label-text">{m.settings_integrations_captcha_solveTimeout()}</span>
							</label>
							<select
								id="timeout"
								bind:value={captchaSettings.timeoutSeconds}
								class="select-bordered select w-full max-w-full min-w-0 select-sm"
								disabled={!captchaSettings.enabled}
							>
								<option value={30}>{m.settings_integrations_captcha_seconds30()}</option>
								<option value={60}>{m.settings_integrations_captcha_seconds60Default()}</option>
								<option value={90}>{m.settings_integrations_captcha_seconds90()}</option>
								<option value={120}>{m.settings_integrations_captcha_minutes2()}</option>
								<option value={180}>{m.settings_integrations_captcha_minutes3()}</option>
							</select>
							<div class="label whitespace-normal">
								<span class="label-text-alt wrap-break-word text-base-content/50">
									{m.settings_integrations_captcha_solveTimeoutHelp()}
								</span>
							</div>
						</div>

						<!-- Cache TTL -->
						<div class="form-control w-full min-w-0">
							<label class="label flex-wrap items-start gap-2 whitespace-normal" for="cacheTtl">
								<span class="label-text">{m.settings_integrations_captcha_cacheDuration()}</span>
							</label>
							<select
								id="cacheTtl"
								bind:value={captchaSettings.cacheTtlSeconds}
								class="select-bordered select w-full max-w-full min-w-0 select-sm"
								disabled={!captchaSettings.enabled}
							>
								<option value={1800}>{m.settings_integrations_captcha_minutes30()}</option>
								<option value={3600}>{m.settings_integrations_captcha_hour1Default()}</option>
								<option value={7200}>{m.settings_integrations_captcha_hours2()}</option>
								<option value={14400}>{m.settings_integrations_captcha_hours4()}</option>
								<option value={28800}>{m.settings_integrations_captcha_hours8()}</option>
								<option value={86400}>{m.settings_integrations_captcha_hours24()}</option>
							</select>
							<div class="label whitespace-normal">
								<span class="label-text-alt wrap-break-word text-base-content/50">
									{m.settings_integrations_captcha_cacheDurationHelp()}
								</span>
							</div>
						</div>
					</div>

					<div class="divider text-sm">
						<Globe class="h-4 w-4" />
						{m.settings_integrations_captcha_proxyOptional()}
					</div>

					<!-- Proxy URL -->
					<div class="form-control w-full min-w-0">
						<label class="label flex-wrap items-start gap-2 whitespace-normal" for="proxyUrl">
							<span class="label-text">{m.settings_integrations_captcha_proxyUrl()}</span>
						</label>
						<input
							id="proxyUrl"
							type="text"
							bind:value={captchaSettings.proxyUrl}
							placeholder="http://proxy.example.com:8080"
							class="input-bordered input input-sm w-full min-w-0"
							disabled={!captchaSettings.enabled}
						/>
						<div class="label whitespace-normal">
							<span class="label-text-alt wrap-break-word text-base-content/50">
								{m.settings_integrations_captcha_proxyUrlHelp()}
							</span>
						</div>
					</div>

					<!-- Proxy Auth -->
					{#if captchaSettings.proxyUrl}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="form-control min-w-0">
								<label
									class="label flex-wrap items-start gap-2 whitespace-normal"
									for="proxyUsername"
								>
									<span class="label-text">{m.settings_integrations_captcha_proxyUsername()}</span>
								</label>
								<input
									id="proxyUsername"
									type="text"
									bind:value={captchaSettings.proxyUsername}
									placeholder={m.settings_integrations_captcha_optional()}
									class="input-bordered input input-sm w-full min-w-0"
									disabled={!captchaSettings.enabled}
								/>
							</div>
							<div class="form-control min-w-0">
								<label
									class="label flex-wrap items-start gap-2 whitespace-normal"
									for="proxyPassword"
								>
									<span class="label-text">{m.settings_integrations_captcha_proxyPassword()}</span>
								</label>
								<input
									id="proxyPassword"
									type="password"
									bind:value={captchaSettings.proxyPassword}
									placeholder={m.settings_integrations_captcha_optional()}
									class="input-bordered input input-sm w-full min-w-0"
									disabled={!captchaSettings.enabled}
								/>
							</div>
						</div>
					{/if}
				</div>

				<div class="flex justify-end">
					<button
						class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
						onclick={saveCaptchaSettings}
						disabled={captchaSaving}
					>
						{#if captchaSaving}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.common_saving()}
						{:else}
							<CheckCircle class="h-4 w-4" />
							{m.settings_integrations_captcha_saveSettings()}
						{/if}
					</button>
				</div>
			</SettingsSection>

			<!-- Test Solver -->
			<SettingsSection
				title={m.settings_integrations_captcha_testSolver()}
				description={m.settings_integrations_captcha_testSolverDesc()}
			>
				<div class="flex flex-col gap-2 sm:flex-row">
					<input
						type="url"
						bind:value={testUrl}
						placeholder="https://example.com"
						class="input-bordered input input-sm w-full min-w-0 sm:flex-1"
						disabled={captchaTesting || !captchaSettings.enabled}
					/>
					<button
						class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
						onclick={testSolver}
						disabled={captchaTesting || !testUrl || !captchaSettings.enabled}
					>
						{#if captchaTesting}
							<RefreshCw class="h-4 w-4 animate-spin" />
							{m.common_testing()}
						{:else}
							<Play class="h-4 w-4" />
							{m.action_test()}
						{/if}
					</button>
				</div>

				{#if testResult}
					<div class="alert {testResult.success ? 'alert-success' : 'alert-error'}">
						{#if testResult.success}
							<CheckCircle class="h-4 w-4" />
						{:else}
							<XCircle class="h-4 w-4" />
						{/if}
						<span>{testResult.message}</span>
					</div>
				{/if}
			</SettingsSection>

			<!-- Statistics -->
			{#if health?.stats}
				<SettingsSection title={m.settings_integrations_captcha_statistics()}>
					<div class="stats w-full stats-vertical bg-base-100 shadow lg:stats-horizontal">
						<div class="stat">
							<div class="stat-figure text-primary">
								<Activity class="h-6 w-6" />
							</div>
							<div class="stat-title">{m.settings_integrations_captcha_solveSuccessRate()}</div>
							<div class="stat-value text-primary">{getSuccessRate()}</div>
							<div class="stat-desc">
								{m.settings_integrations_captcha_solvesAttempted({
									count: health.stats.totalAttempts
								})}
							</div>
						</div>

						<div class="stat">
							<div class="stat-figure text-secondary">
								<Clock class="h-6 w-6" />
							</div>
							<div class="stat-title">{m.settings_integrations_captcha_avgSolveTime()}</div>
							<div class="stat-value text-secondary">
								{formatDuration(health.stats.avgSolveTimeMs)}
							</div>
						</div>

						<div class="stat">
							<div class="stat-figure text-secondary">
								<Globe class="h-6 w-6" />
							</div>
							<div class="stat-title">{m.settings_integrations_captcha_fetchSuccessRate()}</div>
							<div class="stat-value text-secondary">{getFetchSuccessRate()}</div>
							<div class="stat-desc">
								{m.settings_integrations_captcha_fetchesAttempted({
									count: health.stats.fetchAttempts
								})}
							</div>
						</div>

						<div class="stat">
							<div class="stat-figure text-accent">
								<Shield class="h-6 w-6" />
							</div>
							<div class="stat-title">{m.settings_integrations_captcha_cacheHits()}</div>
							<div class="stat-value text-accent">{health.stats.cacheHits}</div>
							<div class="stat-desc">
								{m.settings_integrations_captcha_domainsCached({ count: health.stats.cacheSize })}
							</div>
						</div>
					</div>

					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="text-sm text-base-content/70">
							{#if health.stats.lastSolveAt}
								{m.settings_integrations_captcha_lastSolve()}
								{new Date(health.stats.lastSolveAt).toLocaleString()}
							{:else if health.stats.lastFetchAt}
								{m.settings_integrations_captcha_lastFetch()}
								{new Date(health.stats.lastFetchAt).toLocaleString()}
							{:else}
								{m.settings_integrations_captcha_noActivity()}
							{/if}
						</div>
						<button
							class="btn gap-2 btn-outline btn-sm"
							onclick={clearCache}
							disabled={captchaClearing || health.stats.cacheSize === 0}
						>
							{#if captchaClearing}
								<RefreshCw class="h-4 w-4 animate-spin" />
							{:else}
								<Trash2 class="h-4 w-4" />
							{/if}
							{m.settings_integrations_captcha_clearCache()}
						</button>
					</div>

					{#if health.stats.lastError}
						<div class="alert alert-error">
							<span class="text-sm"
								>{m.settings_integrations_captcha_lastError()} {health.stats.lastError}</span
							>
						</div>
					{/if}
				</SettingsSection>
			{/if}
		{/if}
	{/if}
</SettingsPage>

<!-- Regenerate API Key Confirmation -->
<ConfirmationModal
	open={confirmRegenerateOpen}
	title={m.settings_system_regenerateApiKeyTitle()}
	message={m.settings_system_regenerateApiKeyMessage()}
	confirmLabel={m.settings_system_regenerate()}
	confirmVariant="warning"
	loading={regeneratingMain || regeneratingStreaming}
	onConfirm={() => regenerateKey(regenerateTarget)}
	onCancel={() => (confirmRegenerateOpen = false)}
/>

<ConfirmationModal
	open={confirmRestoreOpen}
	title="Restore configuration backup?"
	message={`This will apply ${selectedRestoreSections.length} selected backup section(s) to the current instance. This action cannot be undone.`}
	confirmLabel="Restore backup"
	confirmVariant="warning"
	loading={backupImporting}
	onConfirm={importConfigurationBackup}
	onCancel={() => (confirmRestoreOpen = false)}
/>

<!-- TMDB API Key Modal -->
<ModalWrapper open={tmdbModalOpen} onClose={closeTmdbModal} maxWidth="md">
	<ModalHeader title={m.settings_integrations_tmdbApiKeyTitle()} onClose={closeTmdbModal} />
	<form
		onsubmit={async (event) => {
			event.preventDefault();
			await handleTmdbSave();
		}}
	>
		<div class="space-y-4 p-4">
			<p class="text-sm text-base-content/70">
				{m.settings_integrations_tmdbApiKeyDescription()}
				<a href="https://www.themoviedb.org/settings/api" target="_blank" class="link link-primary">
					themoviedb.org
				</a>.
			</p>
			<div class="form-control w-full">
				<label class="label" for="tmdbApiKey">
					<span class="label-text">{m.settings_integrations_apiKeyLabel()}</span>
				</label>
				<input
					type="text"
					id="tmdbApiKey"
					name="apiKey"
					bind:value={tmdbApiKey}
					placeholder={data.tmdb.hasApiKey
						? m.settings_integrations_apiKeyPlaceholderExisting()
						: m.settings_integrations_apiKeyPlaceholderNew()}
					class="input-bordered input w-full"
				/>
			</div>
			{#if tmdbError}
				<div class="alert alert-error">
					<span>{tmdbError}</span>
				</div>
			{/if}
		</div>
		<ModalFooter onCancel={closeTmdbModal} onSave={handleTmdbSave} saving={tmdbSaving} />
	</form>
</ModalWrapper>
