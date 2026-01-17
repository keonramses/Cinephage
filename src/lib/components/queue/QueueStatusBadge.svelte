<script lang="ts">
	import type { QueueStatus } from '$lib/types/queue';
	import {
		Clock,
		Download,
		Pause,
		CheckCircle2,
		Loader2,
		AlertCircle,
		AlertTriangle,
		Upload,
		Trash2
	} from 'lucide-svelte';

	interface Props {
		status: QueueStatus;
		class?: string;
	}

	let { status, class: className = '' }: Props = $props();

	const statusConfig: Record<
		QueueStatus,
		{
			label: string;
			variant: string;
			icon: typeof Clock;
		}
	> = {
		queued: { label: 'Queued', variant: 'badge-ghost', icon: Clock },
		downloading: { label: 'Downloading', variant: 'badge-info', icon: Download },
		stalled: { label: 'Stalled', variant: 'badge-warning', icon: AlertTriangle },
		paused: { label: 'Paused', variant: 'badge-warning', icon: Pause },
		completed: { label: 'Completed', variant: 'badge-success', icon: CheckCircle2 },
		postprocessing: { label: 'Post-processing', variant: 'badge-info', icon: Loader2 },
		importing: { label: 'Importing', variant: 'badge-info', icon: Loader2 },
		imported: { label: 'Imported', variant: 'badge-success', icon: CheckCircle2 },
		failed: { label: 'Failed', variant: 'badge-error', icon: AlertCircle },
		seeding: { label: 'Seeding', variant: 'badge-success', icon: Upload },
		'seeding-imported': { label: 'Imported + Seeding', variant: 'badge-success', icon: Upload },
		removed: { label: 'Removed', variant: 'badge-ghost', icon: Trash2 }
	};

	const config = $derived(statusConfig[status] || statusConfig.queued);
	const Icon = $derived(config.icon);
</script>

<span class="badge gap-1 {config.variant} {className}">
	<Icon class="h-3 w-3" />
	{config.label}
</span>
