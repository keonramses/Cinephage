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
		Play
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
	<div role="tablist" class="tabs-boxed tabs">
		<button
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'general'}
			onclick={() => setTab('general')}
		>
			<Server class="h-4 w-4" />
			{m.nav_general()}
		</button>
		<button
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'tmdb'}
			onclick={() => setTab('tmdb')}
		>
			<Film class="h-4 w-4" />
			TMDB
		</button>
		<button
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'captcha'}
			onclick={() => setTab('captcha')}
		>
			<Shield class="h-4 w-4" />
			{m.nav_captchaSolver()}
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
				<div class="flex items-center justify-between">
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

				<div class="mt-3 flex items-center justify-between text-sm text-base-content/70">
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
				<div class="flex items-center justify-between">
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

				<div class="mt-3 flex items-center justify-between text-sm text-base-content/70">
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
						class="btn gap-2 btn-sm btn-primary"
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
						<div class="form-control w-full">
							<label class="label" for="timeout">
								<span class="label-text">{m.settings_integrations_captcha_solveTimeout()}</span>
							</label>
							<select
								id="timeout"
								bind:value={captchaSettings.timeoutSeconds}
								class="select-bordered select select-sm"
								disabled={!captchaSettings.enabled}
							>
								<option value={30}>{m.settings_integrations_captcha_seconds30()}</option>
								<option value={60}>{m.settings_integrations_captcha_seconds60Default()}</option>
								<option value={90}>{m.settings_integrations_captcha_seconds90()}</option>
								<option value={120}>{m.settings_integrations_captcha_minutes2()}</option>
								<option value={180}>{m.settings_integrations_captcha_minutes3()}</option>
							</select>
							<div class="label">
								<span class="label-text-alt text-base-content/50">
									{m.settings_integrations_captcha_solveTimeoutHelp()}
								</span>
							</div>
						</div>

						<!-- Cache TTL -->
						<div class="form-control w-full">
							<label class="label" for="cacheTtl">
								<span class="label-text">{m.settings_integrations_captcha_cacheDuration()}</span>
							</label>
							<select
								id="cacheTtl"
								bind:value={captchaSettings.cacheTtlSeconds}
								class="select-bordered select select-sm"
								disabled={!captchaSettings.enabled}
							>
								<option value={1800}>{m.settings_integrations_captcha_minutes30()}</option>
								<option value={3600}>{m.settings_integrations_captcha_hour1Default()}</option>
								<option value={7200}>{m.settings_integrations_captcha_hours2()}</option>
								<option value={14400}>{m.settings_integrations_captcha_hours4()}</option>
								<option value={28800}>{m.settings_integrations_captcha_hours8()}</option>
								<option value={86400}>{m.settings_integrations_captcha_hours24()}</option>
							</select>
							<div class="label">
								<span class="label-text-alt text-base-content/50">
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
					<div class="form-control w-full">
						<label class="label" for="proxyUrl">
							<span class="label-text">{m.settings_integrations_captcha_proxyUrl()}</span>
						</label>
						<input
							id="proxyUrl"
							type="text"
							bind:value={captchaSettings.proxyUrl}
							placeholder="http://proxy.example.com:8080"
							class="input-bordered input input-sm"
							disabled={!captchaSettings.enabled}
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/50">
								{m.settings_integrations_captcha_proxyUrlHelp()}
							</span>
						</div>
					</div>

					<!-- Proxy Auth -->
					{#if captchaSettings.proxyUrl}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="form-control">
								<label class="label" for="proxyUsername">
									<span class="label-text">{m.settings_integrations_captcha_proxyUsername()}</span>
								</label>
								<input
									id="proxyUsername"
									type="text"
									bind:value={captchaSettings.proxyUsername}
									placeholder={m.settings_integrations_captcha_optional()}
									class="input-bordered input input-sm"
									disabled={!captchaSettings.enabled}
								/>
							</div>
							<div class="form-control">
								<label class="label" for="proxyPassword">
									<span class="label-text">{m.settings_integrations_captcha_proxyPassword()}</span>
								</label>
								<input
									id="proxyPassword"
									type="password"
									bind:value={captchaSettings.proxyPassword}
									placeholder={m.settings_integrations_captcha_optional()}
									class="input-bordered input input-sm"
									disabled={!captchaSettings.enabled}
								/>
							</div>
						</div>
					{/if}
				</div>

				<div class="flex justify-end">
					<button
						class="btn gap-2 btn-sm btn-primary"
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
						class="input-bordered input input-sm w-full sm:flex-1"
						disabled={captchaTesting || !captchaSettings.enabled}
					/>
					<button
						class="btn gap-2 btn-sm btn-primary"
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
