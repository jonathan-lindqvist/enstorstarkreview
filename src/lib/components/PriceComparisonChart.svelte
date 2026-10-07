<script lang="ts">
	import { isValidBeerPriceKr } from '$lib/utils/price';
	import { MAX_VALUE_RATING, fitValueTrend, predictValueRating } from '$lib/utils/price-comparison';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';

	interface Props {
		points: PriceComparisonPoint[];
		barName: string;
		beerPriceKr: string | number | null | undefined;
		valueRating: number;
	}

	let { points, barName, beerPriceKr, valueRating }: Props = $props();

	const marginLeft = 34;
	const marginRight = 14;
	const scatterTop = 28;
	const scatterHeight = 170;
	const scatterBottom = scatterTop + scatterHeight;
	const chartHeight = scatterBottom + 32;
	const valueTicks = [0, 1, 2, 3, 4, 5];
	const tickSteps = [5, 10, 20, 25, 50, 100, 200];

	let width = $state(600);
	let hovered = $state<PriceComparisonPoint | null>(null);

	// A bound number input yields a number, or null/undefined when empty, despite the string state.
	const currentPrice = $derived.by(() => {
		const raw = String(beerPriceKr ?? '').trim();
		const value = Number(raw);
		return raw !== '' && isValidBeerPriceKr(value) ? value : null;
	});

	const allPrices = $derived(points.map((point) => point.beerPriceKr));
	const trend = $derived(fitValueTrend(points));

	const domain = $derived.by(() => {
		const prices = currentPrice === null ? allPrices : [...allPrices, currentPrice];
		let low = Math.min(...prices);
		let high = Math.max(...prices);
		const padding = Math.max(3, (high - low) * 0.04);
		low = Math.max(0, Math.floor((low - padding) / 5) * 5);
		high = Math.ceil((high + padding) / 5) * 5;
		if (high - low < 20) {
			low = Math.max(0, low - 10);
			high += 10;
		}
		return { low, high };
	});

	const plotWidth = $derived(Math.max(120, width - marginLeft - marginRight));
	const x = (price: number) =>
		marginLeft + ((price - domain.low) / (domain.high - domain.low)) * plotWidth;
	const y = (rating: number) => scatterBottom - (rating / MAX_VALUE_RATING) * scatterHeight;

	const priceTicks = $derived.by(() => {
		const span = domain.high - domain.low;
		const maxTicks = Math.max(2, Math.floor(plotWidth / 56));
		const step = tickSteps.find((candidate) => span / candidate <= maxTicks) ?? 500;
		const ticks: number[] = [];
		for (let tick = Math.ceil(domain.low / step) * step; tick <= domain.high; tick += step) {
			ticks.push(tick);
		}
		return ticks;
	});

	const trendPath = $derived.by(() => {
		if (!trend) return null;
		const samples = 40;
		const coordinates: string[] = [];
		for (let index = 0; index <= samples; index += 1) {
			const price = domain.low + ((domain.high - domain.low) * index) / samples;
			coordinates.push(`${x(price).toFixed(1)},${y(predictValueRating(trend, price)).toFixed(1)}`);
		}
		return `M${coordinates.join('L')}`;
	});

	// Prices and ratings are whole numbers, so spread identical points sideways instead of stacking them.
	const scatterPoints = $derived.by(() => {
		// This grouping map is rebuilt inside the derivation, never retained as reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groups = new Map<string, PriceComparisonPoint[]>();
		for (const point of points) {
			if (point.valueRating === null) continue;
			const key = `${point.beerPriceKr}|${point.valueRating}`;
			groups.set(key, [...(groups.get(key) ?? []), point]);
		}
		return [...groups.values()].flatMap((group) =>
			group.map((point, index) => ({
				point,
				cx: x(point.beerPriceKr) + (index - (group.length - 1) / 2) * 8,
				cy: y(point.valueRating ?? 0)
			}))
		);
	});

	const currentLabel = $derived.by(() => {
		const name = barName.trim();
		return name.length > 24 ? `${name.slice(0, 23)}…` : name;
	});
	const currentLabelAnchor = $derived.by(() => {
		if (currentPrice === null) return 'middle';
		if (x(currentPrice) > marginLeft + plotWidth - 70) return 'end';
		if (x(currentPrice) < marginLeft + 70) return 'start';
		return 'middle';
	});

	const describePoint = (point: PriceComparisonPoint) =>
		`${point.title}: ${point.beerPriceKr} kr${point.isHappyHourPrice ? ' (happy hour)' : ''}` +
		(point.valueRating === null ? '' : `, prisvärdhet ${point.valueRating}/5`);

	const chartLabel = $derived(
		`Pris och prisvärdhet för ${points.length} andra barer` +
			(currentPrice === null
				? '.'
				: `. ${currentLabel || 'Den här baren'}: ${currentPrice} kr, prisvärdhet ${valueRating}/5.`)
	);
</script>

<section
	class="rounded-2xl border border-white/85 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
	aria-labelledby="price-comparison-heading"
>
	<h3
		id="price-comparison-heading"
		class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
	>
		Pris jämfört med andra barer
	</h3>
	<p class="mt-1 text-xs text-slate-500">
		Hjälp för att sätta prisvärdhet. Punkterna visar vilken prisvärdhet andra barer fick för sitt
		pris.
	</p>

	{#if points.length === 0}
		<p class="mt-4 text-sm text-slate-600">Det finns inga andra priser att jämföra med än.</p>
	{:else}
		<div class="mt-3 w-full" bind:clientWidth={width}>
			<svg
				width={plotWidth + marginLeft + marginRight}
				height={chartHeight}
				role="img"
				aria-label={chartLabel}
				class="block overflow-visible"
			>
				{#each valueTicks as tick (tick)}
					<line
						x1={marginLeft}
						x2={marginLeft + plotWidth}
						y1={y(tick)}
						y2={y(tick)}
						class={tick === 0 ? 'stroke-clay' : 'stroke-clay/40'}
					/>
					<text
						x={marginLeft - 8}
						y={y(tick) + 3.5}
						text-anchor="end"
						class="fill-slate-500 text-[11px] font-semibold">{tick}</text
					>
				{/each}
				{#each priceTicks as tick (tick)}
					<text
						x={x(tick)}
						y={scatterBottom + 16}
						text-anchor="middle"
						class="fill-slate-500 text-[11px] font-semibold">{tick}</text
					>
				{/each}
				<text
					x={marginLeft + plotWidth}
					y={scatterBottom + 30}
					text-anchor="end"
					class="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.15em]"
				>
					kr för en stor stark
				</text>
				<text
					x={marginLeft}
					y={scatterTop - 8}
					class="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.15em]"
				>
					Prisvärdhet
				</text>

				{#if trendPath}
					<path
						d={trendPath}
						fill="none"
						stroke-width="1.5"
						class="stroke-char/45"
						stroke-dasharray="6 4"
					/>
				{/if}

				{#each scatterPoints as { point, cx, cy } (point.slug)}
					<circle
						{cx}
						{cy}
						r={hovered === point ? 6 : 4.5}
						stroke-width="1.5"
						class={point.isHappyHourPrice ? 'fill-white stroke-ember' : 'fill-ember stroke-white'}
						role="presentation"
						onpointerenter={() => (hovered = point)}
						onpointerleave={() => (hovered = null)}
					>
						<title>{describePoint(point)}</title>
					</circle>
				{/each}

				{#if currentPrice !== null}
					<line
						x1={x(currentPrice)}
						x2={x(currentPrice)}
						y1={scatterTop}
						y2={scatterBottom}
						stroke-dasharray="3 3"
						class="stroke-orange-500/45"
					/>
					<circle
						cx={x(currentPrice)}
						cy={y(valueRating)}
						r="7"
						stroke-width="2"
						class="pointer-events-none fill-orange-500 stroke-white"
					/>
					{#if currentLabel}
						<text
							x={x(currentPrice)}
							y={y(valueRating) - 12}
							text-anchor={currentLabelAnchor}
							stroke="white"
							stroke-width="3"
							paint-order="stroke"
							class="pointer-events-none fill-ink text-[11px] font-bold"
						>
							{currentLabel}
						</text>
					{/if}
				{/if}
			</svg>
		</div>

		<p class="mt-1 min-h-4 text-xs font-semibold text-slate-700" aria-live="polite">
			{hovered ? describePoint(hovered) : ''}
		</p>
	{/if}
</section>
