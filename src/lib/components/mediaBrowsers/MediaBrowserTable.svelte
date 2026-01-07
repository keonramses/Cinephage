<script lang="ts">
	import {
		Settings,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Monitor,
		FlaskConical,
		Loader2,
		CheckCircle2,
		XCircle
	} from 'lucide-svelte';
	import type { MediaBrowserServerPublic } from '$lib/server/notifications/mediabrowser/types';

	interface Props {
		servers: MediaBrowserServerPublic[];
		onEdit: (server: MediaBrowserServerPublic) => void;
		onDelete: (server: MediaBrowserServerPublic) => void;
		onToggle: (server: MediaBrowserServerPublic) => void;
		onTest?: (server: MediaBrowserServerPublic) => Promise<void>;
		testingId?: string | null;
	}

	let { servers, onEdit, onDelete, onToggle, onTest, testingId = null }: Props = $props();

	function getServerTypeLabel(type: string): string {
		return type === 'jellyfin' ? 'Jellyfin' : 'Emby';
	}

	function getServerTypeBadgeClass(type: string): string {
		return type === 'jellyfin' ? 'badge-primary' : 'badge-secondary';
	}
</script>

{#if servers.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Monitor class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No media servers configured</p>
		<p class="mt-1 text-sm">Add a Jellyfin or Emby server to enable library notifications</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Host</th>
					<th>Server Info</th>
					<th>Test</th>
					<th>Status</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each servers as server (server.id)}
					<tr class="hover">
						<td>
							<div class="flex items-center gap-3">
								<div class="placeholder avatar">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full {server.serverType ===
										'jellyfin'
											? 'bg-primary text-primary-content'
											: 'bg-secondary text-secondary-content'}"
									>
										<Monitor class="h-5 w-5" />
									</div>
								</div>
								<div>
									<div class="font-bold">{server.name}</div>
									<div class="text-sm opacity-50">
										<span class="badge badge-xs {getServerTypeBadgeClass(server.serverType)}">
											{getServerTypeLabel(server.serverType)}
										</span>
									</div>
								</div>
							</div>
						</td>
						<td>
							<div class="max-w-48 truncate font-mono text-sm" title={server.host}>
								{server.host}
							</div>
						</td>
						<td>
							{#if server.serverName}
								<div class="flex flex-col gap-1">
									<span class="badge badge-ghost badge-sm">{server.serverName}</span>
									{#if server.serverVersion}
										<span class="badge badge-outline badge-sm">v{server.serverVersion}</span>
									{/if}
								</div>
							{:else}
								<span class="text-base-content/50">-</span>
							{/if}
						</td>
						<td>
							{#if testingId === server.id}
								<span class="badge gap-1 badge-ghost badge-sm">
									<Loader2 class="h-3 w-3 animate-spin" />
									Testing
								</span>
							{:else if server.testResult === 'success'}
								<span class="badge gap-1 badge-sm badge-success">
									<CheckCircle2 class="h-3 w-3" />
									OK
								</span>
							{:else if server.testResult === 'failed'}
								<span
									class="badge gap-1 badge-sm badge-error"
									title={server.testError ?? 'Connection failed'}
								>
									<XCircle class="h-3 w-3" />
									Failed
								</span>
							{:else}
								<span class="badge badge-ghost badge-sm">Not tested</span>
							{/if}
						</td>
						<td>
							<span class="badge {server.enabled ? 'badge-success' : 'badge-ghost'}">
								{server.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</td>
						<td>
							<div class="flex justify-end gap-1">
								{#if onTest}
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => onTest(server)}
										title="Test connection"
										disabled={testingId === server.id}
									>
										{#if testingId === server.id}
											<Loader2 class="h-4 w-4 animate-spin" />
										{:else}
											<FlaskConical class="h-4 w-4" />
										{/if}
									</button>
								{/if}
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => onToggle(server)}
									title={server.enabled ? 'Disable' : 'Enable'}
								>
									{#if server.enabled}
										<ToggleRight class="h-4 w-4 text-success" />
									{:else}
										<ToggleLeft class="h-4 w-4" />
									{/if}
								</button>
								<button class="btn btn-ghost btn-sm" onclick={() => onEdit(server)} title="Edit">
									<Settings class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-sm"
									onclick={() => onDelete(server)}
									title="Delete"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
