<script lang="ts">
	import PriceComparisonChart from '../PriceComparisonChart.svelte';
	import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
	import { ratingWord } from '$lib/review-wizard';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';
	import type { ReviewRatingValues } from '$lib/types/bar-review';

	interface Props {
		ratings: ReviewRatingValues;
		/** The aspect on screen. Without scripts every aspect shows. */
		index: number;
		enhanced: boolean;
		problems: Record<string, string>;
		priceComparison: PriceComparisonPoint[];
		barName: string;
		beerPriceKr: string | number | undefined;
	}

	let {
		ratings = $bindable(),
		index = $bindable(),
		enhanced,
		problems,
		priceComparison,
		barName,
		beerPriceKr
	}: Props = $props();

	const values = [0, 1, 2, 3, 4, 5];
	const count = REVIEW_RATING_METRICS.length;
	const ratingsError = $derived(problems['/']);
</script>

<div class="space-y-5">
	<div class="flex items-center justify-between gap-4">
		<h2 class="wizard-heading whitespace-nowrap" tabindex="-1">
			Betyg
			{#if enhanced}
				<span class="text-slate-500 tabular-nums">{index + 1} av {count}</span>
			{/if}
		</h2>
		{#if enhanced}
			<div class="flex items-center">
				{#each REVIEW_RATING_METRICS as metric, position (metric.key)}
					<button
						type="button"
						class="flex h-11 w-4 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-sky-500"
						aria-label="{metric.label}, {ratings[metric.key]} av 5"
						aria-current={position === index ? 'step' : undefined}
						onclick={() => (index = position)}
					>
						<span
							class="size-2 rounded-full transition-colors {position === index
								? 'bg-slate-900'
								: position < index
									? 'bg-amber-600'
									: 'bg-slate-300'}"
						></span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if ratingsError}
		<p class="field-error" role="alert">{ratingsError}</p>
	{/if}

	<div class="relative">
		{#if enhanced}
			<!-- The next cards peek out below the current one. -->
			<div
				class="absolute inset-x-8 -bottom-5 h-12 rounded-3xl border border-slate-200 bg-white/50 transition-opacity"
				class:opacity-0={index >= count - 2}
				aria-hidden="true"
			></div>
			<div
				class="absolute inset-x-4 -bottom-2.5 h-12 rounded-3xl border border-slate-200 bg-white/75 transition-opacity"
				class:opacity-0={index >= count - 1}
				aria-hidden="true"
			></div>
		{/if}
		{#each REVIEW_RATING_METRICS as metric, position (metric.key)}
			{@const value = ratings[metric.key]}
			<fieldset
				id={metric.key}
				tabindex="-1"
				class="relative rounded-3xl border border-slate-200 bg-white px-5 pt-6 pb-5 sm:px-8 {enhanced
					? ''
					: 'mb-4'}"
				hidden={enhanced && position !== index}
			>
				<legend class="sr-only">{metric.label}</legend>
				<div class="text-center" aria-hidden="true">
					<p class="font-serif text-3xl font-semibold text-balance text-slate-900">
						{metric.label}
					</p>
					<p class="mt-1 text-slate-600">{metric.description}</p>
				</div>
				<div class="mt-6 flex items-baseline justify-center gap-3" aria-hidden="true">
					<span class="font-serif text-6xl font-semibold text-amber-700 tabular-nums">{value}</span>
					<span class="text-xl font-semibold text-slate-900">{ratingWord(metric.key, value)}</span>
					<span class="text-sm text-slate-500">av 5</span>
				</div>
				<div class="mt-6 grid grid-cols-6 gap-2">
					{#each values as option (option)}
						<label class="relative cursor-pointer">
							<input
								type="radio"
								name={metric.key}
								value={option}
								checked={value === option}
								onchange={() => (ratings[metric.key] = option)}
								class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
							/>
							<span
								class="flex aspect-square max-h-14 w-full items-center justify-center rounded-full bg-slate-900/8 text-xl font-semibold text-slate-900 tabular-nums transition-colors duration-150 peer-checked:bg-amber-700 peer-checked:text-white peer-hover:bg-slate-900/12 peer-checked:peer-hover:bg-amber-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-500"
							>
								{option}<span class="sr-only">, {ratingWord(metric.key, option)}</span>
							</span>
						</label>
					{/each}
				</div>
				{#if metric.key === 'price' && priceComparison.length}
					<div class="mt-6">
						<PriceComparisonChart
							points={priceComparison}
							{barName}
							{beerPriceKr}
							valueRating={value}
						/>
					</div>
				{/if}
			</fieldset>
		{/each}
	</div>
</div>
