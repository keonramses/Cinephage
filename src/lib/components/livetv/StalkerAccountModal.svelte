<script lang="ts">
	import { X, Loader2, XCircle, CheckCircle2, Tv } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import type { StalkerAccount, StalkerAccountTestResult } from '$lib/types/livetv';

	interface StalkerAccountFormData {
		name: string;
		portalUrl: string;
		macAddress: string;
		enabled: boolean;
	}

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		account?: StalkerAccount | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: StalkerAccountFormData) => void;
		onDelete?: () => void;
		onTest: (data: { portalUrl: string; macAddress: string }) => Promise<StalkerAccountTestResult>;
	}

	let {
		open,
		mode,
		account = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Form state
	let name = $state('');
	let portalUrl = $state('');
	let macAddress = $state('');
	let enabled = $state(true);

	// UI state
	let testing = $state(false);
	let testResult = $state<StalkerAccountTestResult | null>(null);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Stalker Account' : 'Edit Stalker Account');

	// Validation
	const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
	const isMacValid = $derived(macRegex.test(macAddress));
	const isUrlValid = $derived(() => {
		try {
			new URL(portalUrl);
			return true;
		} catch {
			return false;
		}
	});
	const canSubmit = $derived(
		name.trim().length > 0 && portalUrl.trim().length > 0 && isMacValid && isUrlValid()
	);

	// Reset form when modal opens or account changes
	$effect(() => {
		if (open) {
			name = account?.name ?? '';
			portalUrl = account?.portalUrl ?? '';
			macAddress = account?.macAddress ?? '';
			enabled = account?.enabled ?? true;
			testResult = null;
		}
	});

	function formatMacAddress(value: string): string {
		// Remove non-hex characters
		const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
		// Add colons every 2 characters
		const parts = hex.match(/.{1,2}/g) || [];
		return parts.slice(0, 6).join(':');
	}

	function handleMacInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const cursorPos = input.selectionStart || 0;
		const oldLength = macAddress.length;

		macAddress = formatMacAddress(input.value);

		// Adjust cursor position after formatting
		const newLength = macAddress.length;
		const diff = newLength - oldLength;
		requestAnimationFrame(() => {
			input.setSelectionRange(cursorPos + diff, cursorPos + diff);
		});
	}

	function getFormData(): StalkerAccountFormData {
		return {
			name: name.trim(),
			portalUrl: portalUrl.trim(),
			macAddress: macAddress.toUpperCase(),
			enabled
		};
	}

	async function handleTest() {
		if (!canSubmit) return;

		testing = true;
		testResult = null;

		try {
			testResult = await onTest({
				portalUrl: portalUrl.trim(),
				macAddress: macAddress.toUpperCase()
			});
		} finally {
			testing = false;
		}
	}

	function handleSave() {
		if (!canSubmit) return;
		onSave(getFormData());
	}

	function formatExpiryDate(isoDate: string | null): string {
		if (!isoDate) return 'Unknown';
		try {
			return new Date(isoDate).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return 'Unknown';
		}
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="lg" labelledBy="stalker-account-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
				<Tv class="h-5 w-5 text-primary" />
			</div>
			<h3 id="stalker-account-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		</div>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Form -->
	<div class="space-y-4">
		<!-- Name -->
		<div class="form-control">
			<label class="label py-1" for="name">
				<span class="label-text">Name</span>
			</label>
			<input
				id="name"
				type="text"
				class="input-bordered input input-sm"
				bind:value={name}
				placeholder="My IPTV Account"
			/>
			<div class="label py-1">
				<span class="label-text-alt text-xs">A friendly name for this account</span>
			</div>
		</div>

		<!-- Portal URL -->
		<div class="form-control">
			<label class="label py-1" for="portalUrl">
				<span class="label-text">Portal URL</span>
			</label>
			<div class="relative">
				<input
					id="portalUrl"
					type="url"
					class="input-bordered input input-sm w-full pr-8"
					class:input-error={portalUrl.length > 0 && !isUrlValid()}
					bind:value={portalUrl}
					placeholder="http://portal.example.com/c"
				/>
				{#if portalUrl.length > 0}
					<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
						{#if isUrlValid()}
							<CheckCircle2 class="h-4 w-4 text-success" />
						{:else}
							<XCircle class="h-4 w-4 text-error" />
						{/if}
					</div>
				{/if}
			</div>
			<div class="label py-1">
				<span class="label-text-alt text-xs">
					The full portal URL (e.g., http://portal.example.com/c)
				</span>
			</div>
		</div>

		<!-- MAC Address -->
		<div class="form-control">
			<label class="label py-1" for="macAddress">
				<span class="label-text">MAC Address</span>
			</label>
			<div class="relative">
				<input
					id="macAddress"
					type="text"
					class="input-bordered input input-sm w-full pr-8 font-mono"
					class:input-error={macAddress.length > 0 && !isMacValid}
					value={macAddress}
					oninput={handleMacInput}
					placeholder="00:1A:79:XX:XX:XX"
					maxlength="17"
				/>
				{#if macAddress.length > 0}
					<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
						{#if isMacValid}
							<CheckCircle2 class="h-4 w-4 text-success" />
						{:else}
							<XCircle class="h-4 w-4 text-error" />
						{/if}
					</div>
				{/if}
			</div>
			<div class="label py-1">
				<span class="label-text-alt text-xs">
					Format: XX:XX:XX:XX:XX:XX (colons added automatically)
				</span>
			</div>
		</div>

		<!-- Enabled -->
		<label class="label cursor-pointer gap-2">
			<input type="checkbox" class="checkbox checkbox-sm" bind:checked={enabled} />
			<span class="label-text">Enabled</span>
		</label>
	</div>

	<!-- Save Error -->
	{#if error}
		<div class="mt-6 alert alert-error">
			<XCircle class="h-5 w-5" />
			<div>
				<div class="font-medium">Failed to save</div>
				<div class="text-sm opacity-80">{error}</div>
			</div>
		</div>
	{/if}

	<!-- Test Result -->
	{#if testResult}
		<div class="mt-6">
			{#if testResult.success && testResult.profile}
				<div class="alert alert-success">
					<CheckCircle2 class="h-5 w-5" />
					<div class="flex-1">
						<div class="font-medium">Connection successful</div>
						<div class="mt-2 grid grid-cols-2 gap-2 text-sm opacity-80">
							<div>Channels: {testResult.profile.channelCount.toLocaleString()}</div>
							<div>Categories: {testResult.profile.categoryCount}</div>
							<div>Streams: {testResult.profile.playbackLimit} concurrent</div>
							<div>
								Status: <span
									class="badge badge-sm {testResult.profile.status === 'active'
										? 'badge-success'
										: testResult.profile.status === 'expired'
											? 'badge-error'
											: 'badge-warning'}"
								>
									{testResult.profile.status}
								</span>
							</div>
							{#if testResult.profile.expiresAt}
								<div class="col-span-2">
									Expires: {formatExpiryDate(testResult.profile.expiresAt)}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="alert alert-error">
					<XCircle class="h-5 w-5" />
					<div>
						<div class="font-medium">Connection failed</div>
						<div class="text-sm opacity-80">{testResult.error || 'Unknown error'}</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Actions -->
	<div class="modal-action">
		{#if mode === 'edit' && onDelete}
			<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
		{/if}

		<button class="btn btn-ghost" onclick={handleTest} disabled={testing || saving || !canSubmit}>
			{#if testing}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Test
		</button>

		<button class="btn btn-ghost" onclick={onClose}>Cancel</button>

		<button class="btn btn-primary" onclick={handleSave} disabled={saving || !canSubmit}>
			{#if saving}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Save
		</button>
	</div>
</ModalWrapper>
