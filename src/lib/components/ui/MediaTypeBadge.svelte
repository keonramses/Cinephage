<script lang="ts">
	interface Props {
		type: 'movie' | 'tv' | 'streaming';
		size?: 'xs' | 'sm' | 'md';
		class?: string;
	}

	let { type, size = 'sm', class: className = '' }: Props = $props();

	const labels = {
		movie: 'Movie',
		tv: 'TV',
		streaming: 'Stream'
	};

	const colorClasses = {
		movie: 'bg-primary/80 text-primary-content',
		tv: 'bg-secondary/80 text-secondary-content',
		streaming: 'bg-info/80 text-info-content'
	};

	const sizeClasses = {
		xs: 'badge-xs',
		sm: 'badge-sm',
		md: ''
	};
</script>

<div
	class="badge border-none font-semibold shadow-sm backdrop-blur-sm {colorClasses[
		type
	]} {sizeClasses[size]} {className}"
>
	{labels[type]}
</div>
