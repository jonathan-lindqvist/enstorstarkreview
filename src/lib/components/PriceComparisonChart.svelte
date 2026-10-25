<script lang="ts">
	import { isValidBeerPriceKr } from '$lib/utils/price';
	import PriceComparisonPlot from './PriceComparisonPlot.svelte';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';

	interface Props {
		points: PriceComparisonPoint[];
		barName: string;
		beerPriceKr: string | number | null | undefined;
		valueRating: number;
	}

	let { points, barName, beerPriceKr, valueRating }: Props = $props();

	// A bound number input yields a number, or null/undefined when empty, despite the string state.
	const currentPrice = $derived.by(() => {
		const raw = String(beerPriceKr ?? '').trim();
		const value = Number(raw);
		return raw !== '' && isValidBeerPriceKr(value) ? value : null;
	});

	const current = $derived(
		currentPrice === null ? null : { name: barName, price: currentPrice, valueRating }
	);

	const chartLabel = $derived(
		`Pris och prisvärdhet för ${points.length} andra barer` +
			(currentPrice === null
				? '.'
				: `. ${barName.trim() || 'Den här baren'}: ${currentPrice} kr, prisvärdhet ${valueRating}/5.`)
	);
</script>

<section class="border-t border-slate-200 pt-6" aria-labelledby="price-comparison-heading">
	<h3 id="price-comparison-heading" class="text-base font-semibold text-slate-900">
		Pris jämfört med andra barer
	</h3>
	<p class="field-help mt-1">
		Hjälp för att sätta prisvärdhet. Punkterna visar vilken prisvärdhet andra barer fick för sitt
		pris.
	</p>

	{#if points.length === 0}
		<p class="mt-4 text-sm text-slate-600">Det finns inga andra priser att jämföra med än.</p>
	{:else}
		<PriceComparisonPlot {points} {current} label={chartLabel} />
	{/if}
</section>
