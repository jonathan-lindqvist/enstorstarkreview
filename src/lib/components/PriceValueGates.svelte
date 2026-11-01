<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';
	import { comparePriceValues, type PriceValueBar } from '$lib/utils/price-value';

	interface Props {
		points: PriceComparisonPoint[];
	}

	let { points }: Props = $props();

	const marginLeft = 34;
	const marginRight = 14;
	const top = 12;
	const rowHeight = 40;
	const plotHeight = rowHeight * 6;
	const chartHeight = top + plotHeight + 42;
	const minKrPerCl = 0.7;
	const maxKrPerCl = 3;
	const ratings = [5, 4, 3, 2, 1, 0];
	const ticks = [1, 1.5, 2, 2.5, 3];
	const laneOffsets = [0, -11, 11];

	let width = $state(600);
	let hovered = $state<PriceValueBar | null>(null);

	const comparison = $derived(comparePriceValues(points));
	const plotWidth = $derived(Math.max(120, width - marginLeft - marginRight));
	const exact = $derived(comparison.bars.filter(({ distance }) => distance === 0).length);
	const near = $derived(comparison.bars.filter(({ distance }) => distance === 1).length);
	const far = $derived(comparison.bars.filter(({ distance }) => distance >= 2).length);

	const x = (krPerCl: number) =>
		marginLeft +
		((Math.min(maxKrPerCl, Math.max(minKrPerCl, krPerCl)) - minKrPerCl) /
			(maxKrPerCl - minKrPerCl)) *
			plotWidth;
	const rowCenter = (rating: number) => top + (5 - rating + 0.5) * rowHeight;
	const formatKr = (value: number) =>
		value.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const gateRange = (from: number, below: number | null) => {
		if (below === null) return `från ${formatKr(from)}`;
		return from === 0 ? `under ${formatKr(below)}` : `${formatKr(from)}–${formatKr(below)}`;
	};
	const distanceClass = (distance: number) =>
		distance === 0 ? 'fill-slate-500' : distance === 1 ? 'fill-amber-600' : 'fill-red-600';
	const distanceStroke = (distance: number) =>
		distance === 1 ? 'stroke-amber-600' : 'stroke-red-600';
	const describe = (bar: PriceValueBar) =>
		`${bar.point.title}: ${bar.point.beerPriceKr} kr för ${bar.point.beerVolumeCl ?? 40} cl` +
		`${bar.assumedVolume ? ' (antaget)' : ''}, ${formatKr(bar.krPerCl)} kr/cl, ` +
		`betyg ${bar.valueRating}, väntat betyg ${bar.gateRating}`;

	// Dots in a row move to a free lane instead of covering each other.
	const dots = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const lastInLane = new Map<string, number>();
		return [...comparison.bars]
			.sort((a, b) => a.krPerCl - b.krPerCl)
			.map((bar) => {
				const cx = x(bar.krPerCl);
				const lane = laneOffsets.findIndex(
					(_, index) => cx - (lastInLane.get(`${bar.valueRating}|${index}`) ?? -99) >= 10
				);
				const chosen = lane === -1 ? 0 : lane;
				lastInLane.set(`${bar.valueRating}|${chosen}`, cx);
				return { bar, cx, cy: rowCenter(bar.valueRating) + laneOffsets[chosen] };
			});
	});
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
				x={x(gate.fromKrPerCl)}
				y={rowCenter(gate.rating) - rowHeight / 2}
				width={x(gate.belowKrPerCl ?? maxKrPerCl) - x(gate.fromKrPerCl)}
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
			class="fill-slate-500 text-xs font-medium">kr/cl</text
		>
		{#each dots as { bar, cx, cy } (bar.point.slug)}
			<a
				href={resolve('/[slug]', { slug: encodeURIComponent(bar.point.slug) })}
				aria-label={describe(bar)}
				class="cursor-pointer outline-none"
				onpointerenter={() => (hovered = bar)}
				onpointerleave={() => (hovered = null)}
				onfocus={() => (hovered = bar)}
				onblur={() => (hovered = null)}
			>
				{#if bar.distance > 0}
					<line
						x1={cx}
						x2={cx}
						y1={cy}
						y2={rowCenter(bar.gateRating)}
						stroke-width="1"
						class="{distanceStroke(bar.distance)} opacity-60"
					/>
				{/if}
				<circle {cx} {cy} r="9" class="fill-transparent" />
				{#if hovered === bar}
					<circle {cx} {cy} r="8" fill="none" stroke-width="2" class="stroke-sky-500" />
				{/if}
				<circle {cx} {cy} r="4.5" class={distanceClass(bar.distance)} />
			</a>
		{/each}
	</svg>
</div>
<p class="mt-1 min-h-6 text-sm text-slate-600" aria-live="polite">
	{hovered ? describe(hovered) : 'Peka på en punkt för att se baren.'}
</p>

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
	<caption class="sr-only">Prisklasser för prisvärdhet</caption>
	<thead>
		<tr class="border-b border-slate-200 text-slate-900">
			<th scope="col" class="w-2/5 py-1 pr-2 font-semibold">Kr/cl</th>
			<th scope="col" class="px-1 py-1 text-right font-semibold">Väntat betyg</th>
			<th scope="col" class="px-1 py-1 text-right font-semibold">Barer</th>
			<th scope="col" class="py-1 pl-1 text-right font-semibold">Som väntat</th>
		</tr>
	</thead>
	<tbody class="tabular-nums">
		{#each comparison.gates as gate (gate.rating)}
			<tr class="border-b border-slate-200/60">
				<td class="py-1 pr-2">{gateRange(gate.fromKrPerCl, gate.belowKrPerCl)}</td>
				<td class="px-1 py-1 text-right font-semibold text-slate-900">{gate.rating}</td>
				<td class="px-1 py-1 text-right">{gate.count}</td>
				<td class="py-1 pl-1 text-right">{gate.exact}</td>
			</tr>
		{/each}
	</tbody>
</table>
