<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';
	import { formatClPerKr, formatClPerKrNumber } from '$lib/utils/beer-value';
	import {
		ASSUMED_BEER_VOLUME_CL,
		comparePriceValues,
		type PriceValueBar
	} from '$lib/utils/price-value';

	interface Props {
		points: PriceComparisonPoint[];
	}

	let { points }: Props = $props();
	const id = $props.id();

	const marginLeft = 34;
	const marginRight = 14;
	const top = 12;
	const rowHeight = 40;
	const plotHeight = rowHeight * 6;
	const chartHeight = top + plotHeight + 42;
	const minClPerKr = 0.3;
	const maxClPerKr = 1.4;
	const ratings = [5, 4, 3, 2, 1, 0];
	const ticks = [0.4, 0.6, 0.8, 1, 1.2, maxClPerKr];
	const laneOffsets = [0, -11, 11];

	let width = $state(600);
	let previewSlug = $state<string | null>(null);
	let selectedSlug = $state<string | null>(null);
	let tabStopSlug = $state<string | null>(null);

	const comparison = $derived(comparePriceValues(points));
	const plotWidth = $derived(Math.max(120, width - marginLeft - marginRight));
	const exact = $derived(comparison.bars.filter(({ distance }) => distance === 0).length);
	const near = $derived(comparison.bars.filter(({ distance }) => distance === 1).length);
	const far = $derived(comparison.bars.filter(({ distance }) => distance >= 2).length);

	const x = (clPerKr: number) =>
		marginLeft +
		((Math.min(maxClPerKr, Math.max(minClPerKr, clPerKr)) - minClPerKr) /
			(maxClPerKr - minClPerKr)) *
			plotWidth;
	const rowCenter = (rating: number) => top + (5 - rating + 0.5) * rowHeight;
	const gateRange = (above: number, atMost: number | null) => {
		if (atMost === null) return `över ${formatClPerKrNumber(above)}`;
		return above === 0
			? `högst ${formatClPerKrNumber(atMost)}`
			: `${formatClPerKrNumber(above)}–${formatClPerKrNumber(atMost)}`;
	};
	const distanceClass = (distance: number) =>
		distance === 0 ? 'fill-slate-500' : distance === 1 ? 'fill-amber-600' : 'fill-red-600';
	const distanceStroke = (distance: number) =>
		distance === 1 ? 'stroke-amber-600' : 'stroke-red-600';
	const describe = (bar: PriceValueBar) =>
		`${bar.point.title}: ${bar.point.beerPriceKr} kr för ${bar.point.beerVolumeCl ?? ASSUMED_BEER_VOLUME_CL} cl` +
		`${bar.assumedVolume ? ' (antaget)' : ''}, ${formatClPerKr(bar.clPerKr)}, ` +
		`betyg ${bar.valueRating}, väntat betyg ${bar.gateRating}`;

	// Dots in a row move to a free lane instead of covering each other.
	const dots = $derived.by(() => {
		const lastByRating: Partial<Record<number, number[]>> = {};
		return [...comparison.bars]
			.sort((a, b) => a.clPerKr - b.clPerKr)
			.map((bar) => {
				const cx = x(bar.clPerKr);
				const lastInLane = (lastByRating[bar.valueRating] ??= []);
				const lane = laneOffsets.findIndex((_, index) => cx - (lastInLane[index] ?? -99) >= 10);
				const chosen = lane === -1 ? 0 : lane;
				lastInLane[chosen] = cx;
				return { bar, cx, cy: rowCenter(bar.valueRating) + laneOffsets[chosen] };
			});
	});
	const selectedDot = $derived(dots.find(({ bar }) => bar.point.slug === selectedSlug));
	const detailDot = $derived(selectedDot ?? dots.find(({ bar }) => bar.point.slug === previewSlug));
	const tabbableSlug = $derived(
		dots.some(({ bar }) => bar.point.slug === tabStopSlug) ? tabStopSlug : dots[0]?.bar.point.slug
	);

	function focusDot(slug: string) {
		previewSlug = slug;
		tabStopSlug = slug;
	}

	function clearPreview(slug: string) {
		if (previewSlug === slug) previewSlug = null;
	}

	function selectDot(slug: string) {
		selectedSlug = slug;
		tabStopSlug = slug;
	}

	function handleDotKeydown(event: KeyboardEvent & { currentTarget: SVGGElement }, slug: string) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectDot(slug);
		}
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const { previousElementSibling, nextElementSibling } = event.currentTarget;
			const sibling = event.key === 'ArrowLeft' ? previousElementSibling : nextElementSibling;
			(sibling as SVGGElement | null)?.focus();
		}
	}
</script>

<div class="mt-3 w-full overflow-hidden" bind:clientWidth={width}>
	<svg
		width={plotWidth + marginLeft + marginRight}
		height={chartHeight}
		role="group"
		aria-label={`Faktiskt betyg mot väntat betyg för ${comparison.bars.length} barer.`}
		class="block"
	>
		{#each ratings as rating (rating)}
			<line
				x1={marginLeft}
				x2={marginLeft + plotWidth}
				y1={rowCenter(rating) + rowHeight / 2}
				y2={rowCenter(rating) + rowHeight / 2}
				class="stroke-clay/40"
			/>
			<text
				x={marginLeft - 8}
				y={rowCenter(rating) + 3.5}
				text-anchor="end"
				class="fill-slate-500 text-[11px] font-semibold tabular-nums">{rating}</text
			>
		{/each}
		{#each comparison.gates as gate (gate.rating)}
			<rect
				x={x(gate.aboveClPerKr)}
				y={rowCenter(gate.rating) - rowHeight / 2}
				width={x(gate.atMostClPerKr ?? maxClPerKr) - x(gate.aboveClPerKr)}
				height={rowHeight}
				class="fill-amber-700/15"
			/>
		{/each}
		{#each ticks as tick (tick)}
			<text
				x={x(tick)}
				y={top + plotHeight + 16}
				text-anchor="middle"
				class="fill-slate-500 text-[11px] font-semibold tabular-nums"
				>{tick.toLocaleString('sv-SE')}</text
			>
		{/each}
		<text
			x={marginLeft + plotWidth}
			y={top + plotHeight + 32}
			text-anchor="end"
			class="fill-slate-500 text-xs font-medium">cl/kr</text
		>
		{#each dots as { bar, cx, cy } (bar.point.slug)}
			{#if bar.distance > 0}
				<line
					x1={cx}
					x2={cx}
					y1={cy}
					y2={rowCenter(bar.gateRating)}
					stroke-width="1"
					class="{distanceStroke(bar.distance)} pointer-events-none opacity-60"
				/>
			{/if}
		{/each}
		{#if dots.length}
			<g role="toolbar" aria-label="Barer i diagrammet">
				{#each dots as { bar, cx, cy } (bar.point.slug)}
					{@const slug = bar.point.slug}
					<g
						role="button"
						tabindex={tabbableSlug === slug ? 0 : -1}
						aria-label={describe(bar)}
						aria-pressed={selectedSlug === slug}
						class="group cursor-pointer outline-none"
						onpointerenter={(event) => {
							if (event.pointerType !== 'touch') previewSlug = slug;
						}}
						onpointerleave={() => clearPreview(slug)}
						onfocus={() => focusDot(slug)}
						onblur={() => clearPreview(slug)}
						onclick={() => selectDot(slug)}
						onkeydown={(event) => handleDotKeydown(event, slug)}
					>
						<circle {cx} {cy} r="9" class="fill-transparent" />
						<circle {cx} {cy} r="4.5" class={distanceClass(bar.distance)} />
						<circle
							{cx}
							{cy}
							r="10.5"
							fill="none"
							stroke-width="1.5"
							stroke-dasharray="2 2"
							class="pointer-events-none invisible stroke-sky-600 group-focus-visible:visible"
						/>
					</g>
				{/each}
			</g>
		{/if}
		{#if detailDot}
			<circle
				cx={detailDot.cx}
				cy={detailDot.cy}
				r="7.5"
				fill="none"
				stroke-width={selectedDot ? 2 : 1}
				class={['pointer-events-none', selectedDot ? 'stroke-sky-600' : 'stroke-slate-500']}
			/>
		{/if}
	</svg>
</div>
<div class="mt-1 flex min-h-6 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-600">
	<span id={`${id}-details`} class="min-w-0 wrap-anywhere" aria-live="polite">
		{#if detailDot}
			{describe(detailDot.bar)}
		{:else if dots.length}
			Tryck på en punkt för att se baren.
		{:else}
			Inga barer att visa.
		{/if}
	</span>
	{#if selectedDot}
		<a
			href={resolve('/[slug]', { slug: encodeURIComponent(selectedDot.bar.point.slug) })}
			aria-describedby={`${id}-details`}
			class="shrink-0 rounded-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
			>Gå till review</a
		>
	{/if}
</div>

<ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
	<li class="flex items-center gap-2">
		<span class="size-2.5 rounded-full bg-slate-500" aria-hidden="true"></span>
		Som väntat: {exact}
	</li>
	<li class="flex items-center gap-2">
		<span class="size-2.5 rounded-full bg-amber-600" aria-hidden="true"></span>
		1 steg ifrån: {near}
	</li>
	<li class="flex items-center gap-2">
		<span class="size-2.5 rounded-full bg-red-600" aria-hidden="true"></span>
		Minst 2 steg ifrån: {far}
	</li>
</ul>

<table class="mt-5 w-full table-fixed text-left text-sm wrap-break-word text-slate-600">
	<caption class="sr-only">Intervall för prisvärdhet</caption>
	<thead>
		<tr class="border-b border-slate-200 text-slate-900">
			<th scope="col" class="w-2/5 py-1 pr-2 font-semibold">cl/kr</th>
			<th scope="col" class="px-1 py-1 text-right font-semibold">Väntat betyg</th>
			<th scope="col" class="px-1 py-1 text-right font-semibold">Barer</th>
			<th scope="col" class="py-1 pl-1 text-right font-semibold">Som väntat</th>
		</tr>
	</thead>
	<tbody class="tabular-nums">
		{#each comparison.gates as gate (gate.rating)}
			<tr class="border-b border-slate-200/60">
				<td class="py-1 pr-2">{gateRange(gate.aboveClPerKr, gate.atMostClPerKr)}</td>
				<td class="px-1 py-1 text-right font-semibold text-slate-900">{gate.rating}</td>
				<td class="px-1 py-1 text-right">{gate.count}</td>
				<td class="py-1 pl-1 text-right">{gate.exact}</td>
			</tr>
		{/each}
	</tbody>
</table>
