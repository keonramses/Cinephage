<script lang="ts">
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
		AlertCircle
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Track visibility of keys
	let showMainKey = $state(false);
	let showStreamingKey = $state(false);

	// Copy feedback
	let copiedMain = $state(false);
	let copiedStreaming = $state(false);

	// External URL form state
	let externalUrl = $state(data.externalUrl || '');
	let isSavingUrl = $state(false);
	let saveUrlSuccess = $state(false);
	let saveUrlError = $state('');

	async function copyToClipboard(text: string, type: 'main' | 'streaming') {
		try {
			await navigator.clipboard.writeText(text);
			if (type === 'main') {
				copiedMain = true;
				setTimeout(() => (copiedMain = false), 2000);
			} else {
				copiedStreaming = true;
				setTimeout(() => (copiedStreaming = false), 2000);
			}
		} catch {
			// Clipboard API not available
		}
	}

	function maskKey(key: string): string {
		if (!key) return '';
		const prefix = key.split('_')[0];
		return `${prefix}_${'•'.repeat(32)}`;
	}

	// Regenerate loading states
	let regeneratingMain = $state(false);
	let regeneratingStreaming = $state(false);
	let regenerateError = $state('');

	// Generate loading state
	let generatingKeys = $state(false);
	let generateError = $state('');

	async function generateApiKeys() {
		generateError = '';
		generatingKeys = true;

		try {
			const response = await fetch('/api/settings/system/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Failed to generate' }));
				throw new Error(errorData.error || 'Failed to generate API keys');
			}

			const result = await response.json();

			if (result.success) {
				// Reload page to show new keys
				window.location.reload();
			}
		} catch (err) {
			generateError = err instanceof Error ? err.message : 'Failed to generate API keys';
		} finally {
			generatingKeys = false;
		}
	}

	async function regenerateKey(type: 'main' | 'streaming') {
		regenerateError = '';
		const keyId = type === 'main' ? data.mainApiKey?.id : data.streamingApiKey?.id;

		if (!keyId) {
			regenerateError = `No ${type} API key found to regenerate`;
			return;
		}

		if (type === 'main') {
			regeneratingMain = true;
		} else {
			regeneratingStreaming = true;
		}

		try {
			const response = await fetch(`/api/settings/system/api-keys/${keyId}/regenerate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Failed to regenerate' }));
				throw new Error(errorData.error || `Failed to regenerate ${type} API key`);
			}

			const result = await response.json();

			if (result.success && result.data?.key) {
				// Show the new key to the user
				if (type === 'main') {
					if (data.mainApiKey) data.mainApiKey.key = result.data.key;
					showMainKey = true;
				} else {
					if (data.streamingApiKey) data.streamingApiKey.key = result.data.key;
					showStreamingKey = true;
				}
			}
		} catch (err) {
			regenerateError = err instanceof Error ? err.message : `Failed to regenerate ${type} API key`;
		} finally {
			if (type === 'main') {
				regeneratingMain = false;
			} else {
				regeneratingStreaming = false;
			}
		}
	}

	async function saveExternalUrl() {
		isSavingUrl = true;
		saveUrlSuccess = false;
		saveUrlError = '';

		try {
			// Validate URL format if not empty
			if (externalUrl && !isValidUrl(externalUrl)) {
				saveUrlError = 'Please enter a valid URL (e.g., https://cinephage.example.com)';
				return;
			}

			const response = await fetch('/api/settings/external-url', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: externalUrl || null })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Failed to save' }));
				throw new Error(errorData.error || 'Failed to save external URL');
			}

			saveUrlSuccess = true;
			setTimeout(() => (saveUrlSuccess = false), 3000);
		} catch (err) {
			saveUrlError = err instanceof Error ? err.message : 'Failed to save external URL';
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
</script>

<svelte:head>
	<title>System Settings - Cinephage</title>
</svelte:head>

<div class="w-full p-3 sm:p-4">
	<div class="mb-5 sm:mb-6">
		<h1 class="text-2xl font-bold">System Settings</h1>
		<p class="text-base-content/70">
			Configure system-level settings including API authentication.
		</p>
	</div>

	<!-- API Authentication Section -->
	<div class="mb-8">
		<div class="mb-4 flex items-center gap-2">
			<Shield class="h-6 w-6" />
			<h2 class="text-xl font-bold">API Authentication</h2>
		</div>
		<p class="mb-4 text-base-content/70">
			API keys allow external applications to access Cinephage programmatically. Use the Main key
			for full access, or the Media Streaming key for media server integration with Live TV and
			streaming content.
		</p>

		{#if regenerateError}
			<div class="mb-4 alert alert-error">
				<AlertCircle class="h-5 w-5" />
				<span>{regenerateError}</span>
			</div>
		{/if}

		{#if generateError}
			<div class="mb-4 alert alert-error">
				<AlertCircle class="h-5 w-5" />
				<span>{generateError}</span>
			</div>
		{/if}

		{#if !data.mainApiKey && !data.streamingApiKey}
			<div class="mb-4 alert alert-info">
				<AlertCircle class="h-5 w-5" />
				<div class="flex flex-col gap-2">
					<span>No API keys found. Generate keys to enable external access.</span>
					<button
						class="btn w-fit btn-sm btn-primary"
						onclick={generateApiKeys}
						disabled={generatingKeys}
					>
						{#if generatingKeys}
							<span class="loading loading-sm loading-spinner"></span>
							Generating...
						{:else}
							<Key class="h-4 w-4" />
							Generate API Keys
						{/if}
					</button>
				</div>
			</div>
		{/if}

		<!-- Main API Key -->
		<div class="card mb-4 bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Key class="h-5 w-5" />
						<h3 class="card-title text-lg">Main API Key</h3>
					</div>
					<span class="badge badge-primary">Full Access</span>
				</div>

				<div class="mt-4">
					<label class="label">
						<span class="label-text">API Key</span>
					</label>
					<div class="join w-full">
						<input
							type="text"
							class="input-bordered input join-item w-full font-mono"
							value={showMainKey ? data.mainApiKey?.key : maskKey(data.mainApiKey?.key || '')}
							readonly
						/>
						<button
							class="btn join-item btn-ghost"
							onclick={() => (showMainKey = !showMainKey)}
							title={showMainKey ? 'Hide key' : 'Show key'}
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
							title="Copy to clipboard"
							disabled={!data.mainApiKey?.key}
						>
							{#if copiedMain}
								<span class="text-xs text-success">Copied!</span>
							{:else}
								<Copy class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="mt-4 flex items-center gap-4 text-sm text-base-content/70">
					<span
						>Created: {data.mainApiKey?.createdAt
							? new Date(data.mainApiKey.createdAt).toLocaleDateString()
							: 'N/A'}</span
					>
				</div>

				<div class="mt-4 card-actions justify-end">
					<button
						class="btn gap-2 btn-sm btn-warning"
						onclick={() => regenerateKey('main')}
						disabled={regeneratingMain || regeneratingStreaming}
					>
						{#if regeneratingMain}
							<span class="loading loading-sm loading-spinner"></span>
							Regenerating...
						{:else}
							<RefreshCw class="h-4 w-4" />
							Regenerate
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Media Streaming API Key -->
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Server class="h-5 w-5" />
						<h3 class="card-title text-lg">Media Streaming API Key</h3>
					</div>
					<span class="badge badge-secondary">Live TV + Streaming</span>
				</div>

				<p class="mt-2 text-sm text-base-content/70">
					Use this key with media servers like Jellyfin, Plex, or Emby for M3U playlist, EPG access,
					and streaming content (.strm files).
				</p>

				<div class="mt-4">
					<label class="label">
						<span class="label-text">API Key</span>
					</label>
					<div class="join w-full">
						<input
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
							title={showStreamingKey ? 'Hide key' : 'Show key'}
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
							title="Copy to clipboard"
							disabled={!data.streamingApiKey?.key}
						>
							{#if copiedStreaming}
								<span class="text-xs text-success">Copied!</span>
							{:else}
								<Copy class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="mt-4 text-sm text-base-content/70">
					<div class="mb-2 font-semibold">Permissions:</div>
					<ul class="list-inside list-disc space-y-1">
						<li class="text-success">✓ M3U Playlist (/api/livetv/playlist.m3u)</li>
						<li class="text-success">✓ EPG Data (/api/livetv/epg.xml)</li>
						<li class="text-success">✓ Live TV Streams (/api/livetv/stream/*)</li>
						<li class="text-success">✓ Streaming Content (/api/streaming/*)</li>
						<li class="text-error">✗ Library Access</li>
						<li class="text-error">✗ Settings Access</li>
					</ul>
				</div>

				<div class="mt-4 flex items-center gap-4 text-sm text-base-content/70">
					<span
						>Created: {data.streamingApiKey?.createdAt
							? new Date(data.streamingApiKey.createdAt).toLocaleDateString()
							: 'N/A'}</span
					>
				</div>

				<div class="mt-4 card-actions justify-end">
					<button
						class="btn gap-2 btn-sm btn-warning"
						onclick={() => regenerateKey('streaming')}
						disabled={regeneratingMain || regeneratingStreaming}
					>
						{#if regeneratingStreaming}
							<span class="loading loading-sm loading-spinner"></span>
							Regenerating...
						{:else}
							<RefreshCw class="h-4 w-4" />
							Regenerate
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- External URL Section -->
	<div class="mb-8">
		<div class="mb-4 flex items-center gap-2">
			<Globe class="h-6 w-6" />
			<h2 class="text-xl font-bold">External URL</h2>
		</div>
		<p class="mb-4 text-base-content/70">
			Set the public-facing URL for your Cinephage instance. This is used for authentication
			callbacks and generating correct links when behind a reverse proxy.
		</p>

		<div class="card bg-base-200">
			<div class="card-body">
				<div class="flex items-center gap-2">
					<Globe class="h-5 w-5" />
					<h3 class="card-title text-lg">Public URL Configuration</h3>
				</div>

				<p class="mt-2 text-sm text-base-content/70">
					If you access Cinephage through a reverse proxy with HTTPS, enter your public URL here
					(e.g., https://cinephage.yourdomain.com). Leave empty for local HTTP access.
				</p>

				<div class="mt-4">
					<label class="label" for="externalUrl">
						<span class="label-text">External URL</span>
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
							<span>External URL saved successfully</span>
						</div>
					{/if}
				</div>

				<div class="mt-4 text-sm text-base-content/70">
					<div class="mb-2 font-semibold">Examples:</div>
					<ul class="list-inside list-disc space-y-1">
						<li>https://cinephage.example.com (behind reverse proxy)</li>
						<li>https://media.yourdomain.com/cinephage (subpath)</li>
						<li>Leave empty for direct HTTP access</li>
					</ul>
				</div>

				<div class="mt-4 card-actions justify-end">
					<button class="btn gap-2 btn-primary" onclick={saveExternalUrl} disabled={isSavingUrl}>
						{#if isSavingUrl}
							<span class="loading loading-sm loading-spinner"></span>
							Saving...
						{:else}
							<Check class="h-4 w-4" />
							Save External URL
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
