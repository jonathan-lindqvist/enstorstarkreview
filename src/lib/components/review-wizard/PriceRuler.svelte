<script lang="ts">
	import { MAX_BEER_PRICE_KR } from '$lib/utils/price';

	interface Props {
		price: string | number | undefined;
	}

	let { price = $bindable() }: Props = $props();

	const MIN = 1;
	const SPACING = 10;
	// Where the ruler rests before a price is chosen.
	const RESTING = 70;

	const parsed = $derived(typeof price === 'number' ? price : Number(price));
	const hasPrice = $derived(price !== '' && price !== undefined && Number.isFinite(parsed));
	const shown = $derived(hasPrice ? Math.round(parsed) : RESTING);

	let width = $state(0);
	let drag: { x: number; start: number } | null = null;

	const ticks = $derived.by(() => {
		const reach = Math.ceil(width / 2 / SPACING) + 2;
		const first = Math.max(MIN, shown - reach);
		const last = Math.min(MAX_BEER_PRICE_KR, shown + reach);
		return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
	});

	const clamp = (value: number) => Math.min(Math.max(value, MIN), MAX_BEER_PRICE_KR);

	function handlePointerDown(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = { x: event.clientX, start: shown };
		if (!hasPrice) price = shown;
	}

	function handlePointerMove(event: PointerEvent) {
		if (!drag) return;
		const next = clamp(drag.start - Math.round((event.clientX - drag.x) / SPACING));
		if (next !== parsed) price = next;
	}

	function handlePointerUp() {
		drag = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		const steps: Record<string, number> = {
			ArrowLeft: -1,
			ArrowDown: -1,
			ArrowRight: 1,
			ArrowUp: 1,
			PageDown: -10,
			PageUp: 10
		};
		if (event.key === 'Home') price = MIN;
		else if (event.key === 'End') price = MAX_BEER_PRICE_KR;
		else if (event.key in steps) price = clamp(shown + steps[event.key]);
		else return;
		event.preventDefault();
	}
</script>

<div
	class="relative h-16 cursor-ew-resize touch-none rounded-xl select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
	role="slider"
	tabindex="0"
	aria-label="Prislinjal"
	aria-valuemin={MIN}
	aria-valuemax={MAX_BEER_PRICE_KR}
	aria-valuenow={hasPrice ? shown : undefined}
	aria-valuetext={hasPrice ? `${shown} kronor` : 'Inget pris'}
	bind:clientWidth={width}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onkeydown={handleKeydown}
>
	<div class="ruler absolute inset-0 overflow-hidden">
		{#each ticks as kr (kr)}
			{@const major = kr % 10 === 0}
			<span
				class="absolute top-2 w-0.5 -translate-x-1/2 rounded-full {major
					? 'h-7 bg-slate-500'
					: kr % 5 === 0
						? 'h-5 bg-slate-400'
						: 'h-3 bg-slate-300'}"
				style={`left: ${width / 2 + (kr - shown) * SPACING}px`}
			></span>
			{#if major}
				<span
					class="absolute top-10 -translate-x-1/2 text-xs font-semibold text-slate-500 tabular-nums"
					style={`left: ${width / 2 + (kr - shown) * SPACING}px`}>{kr}</span
				>
			{/if}
		{/each}
	</div>
	<span
		class="absolute top-0 left-1/2 h-11 w-1 -translate-x-1/2 rounded-full {hasPrice
			? 'bg-amber-600'
			: 'bg-amber-600/40'}"
	></span>
</div>

<style>
	/* Ticks fade out at both ends. The mask only sets opacity, not colour. */
	.ruler {
		mask-image: linear-gradient(to right, transparent, black 25%, black 75%, transparent);
	}
</style>
