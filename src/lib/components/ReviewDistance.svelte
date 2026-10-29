<script lang="ts">
	import Route from '@lucide/svelte/icons/route';
	import { formatDistanceKm } from '$lib/utils/review-distance';

	interface Props {
		distanceKm?: number | null;
		variant?: 'default' | 'photo';
	}

	let { distanceKm, variant = 'default' }: Props = $props();
	const text = $derived(formatDistanceKm(distanceKm));
</script>

{#if text}
	<span
		data-testid="review-distance"
		class={[
			'inline-flex items-center gap-1.5 whitespace-nowrap',
			variant === 'photo'
				? 'h-7 rounded-full bg-black/40 px-2.5 text-[0.8125rem] font-bold text-on-photo backdrop-blur-md'
				: 'text-sm text-slate-500'
		]}
		title="Ungefärligt avstånd fågelvägen från din position"
		aria-label={`Ungefärligt avstånd fågelvägen från din position: ${text}`}
	>
		<Route size={16} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
		{text}
	</span>
{/if}
