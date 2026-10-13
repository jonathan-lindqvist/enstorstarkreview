<script lang="ts">
	import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
	import { createTickFeedback } from './price-ruler-feedback';
	import { PriceRulerMotion, releaseVelocity, type PointerSample } from './price-ruler-motion';

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
	// Continuous position while dragging or coasting; otherwise the ruler follows `price`.
	let live = $state<number | null>(null);
	const position = $derived(live ?? shown);

	const range = { min: MIN, max: MAX_BEER_PRICE_KR };
	const feedback = createTickFeedback();
	let motion: PriceRulerMotion | null = null;
	let drag: { x: number; start: number; samples: PointerSample[] } | null = null;
	let frame = 0;

	const ticks = $derived.by(() => {
		const reach = Math.ceil(width / 2 / SPACING) + 2;
		const centre = Math.round(position);
		const first = Math.max(MIN, centre - reach);
		const last = Math.min(MAX_BEER_PRICE_KR, centre + reach);
		return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
	});

	const clamp = (value: number) => Math.min(Math.max(value, MIN), MAX_BEER_PRICE_KR);

	$effect(() => () => {
		cancelAnimationFrame(frame);
		feedback.dispose();
	});

	function select(value: number, now: number) {
		if (hasPrice && value === parsed) return;
		price = value;
		feedback.tick(now);
	}

	function settle() {
		cancelAnimationFrame(frame);
		motion = null;
		live = null;
	}

	function coast(previous: number) {
		frame = requestAnimationFrame((now) => {
			if (!motion) return;
			motion.advance((now - previous) / 1000);
			live = motion.position;
			select(motion.selected, now);
			if (motion.isMoving) coast(now);
			else settle();
		});
	}

	function handlePointerDown(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		feedback.prepare();
		// Touching a coasting ruler catches it where it is.
		cancelAnimationFrame(frame);
		motion = new PriceRulerMotion(position, range);
		live = motion.position;
		drag = {
			x: event.clientX,
			start: motion.position,
			samples: [{ x: event.clientX, t: event.timeStamp }]
		};
		if (!hasPrice) price = motion.selected;
	}

	function handlePointerMove(event: PointerEvent) {
		if (!drag || !motion) return;
		motion.drag(drag.start - (event.clientX - drag.x) / SPACING);
		live = motion.position;
		drag.samples.push({ x: event.clientX, t: event.timeStamp });
		if (drag.samples.length > 20) drag.samples.shift();
		select(motion.selected, event.timeStamp);
	}

	function handlePointerUp(event: PointerEvent) {
		if (!drag || !motion) return;
		const velocity =
			event.type === 'pointercancel' ? 0 : releaseVelocity(drag.samples, event.timeStamp, SPACING);
		drag = null;
		motion.release(velocity, matchMedia('(prefers-reduced-motion: reduce)').matches);
		select(motion.selected, event.timeStamp);
		if (motion.isMoving) coast(performance.now());
		else settle();
	}

	function handleKeydown(event: KeyboardEvent) {
		settle();
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
		feedback.prepare();
		feedback.tick(event.timeStamp);
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
				style={`left: ${width / 2 + (kr - position) * SPACING}px`}
			></span>
			{#if major}
				<span
					class="absolute top-10 -translate-x-1/2 text-xs font-semibold text-slate-500 tabular-nums"
					style={`left: ${width / 2 + (kr - position) * SPACING}px`}>{kr}</span
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
