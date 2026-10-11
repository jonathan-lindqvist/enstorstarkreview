<script lang="ts">
	import type { Snippet } from 'svelte';
	import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
	import type { ReviewRatingValues } from '$lib/types/bar-review';
	import { calculateOverallRating } from '$lib/utils/ratings';
	interface Props {
		hasError: (field: string) => boolean;
		getFieldErrorMessage: (field: string, fallback: string) => string;
		ratings: ReviewRatingValues;
		rating: number;
		// Shown between the aspect sliders and the overall rating.
		afterMetrics?: Snippet;
	}
	let {
		hasError,
		getFieldErrorMessage,
		ratings = $bindable(),
		rating = $bindable(),
		afterMetrics
	}: Props = $props();
	const sliderLabels = [0, 1, 2, 3, 4, 5];
	const overallRatingLabels = [0, 1, 2, 3];
	function calculateScore() {
		rating = calculateOverallRating(REVIEW_RATING_METRICS.map((metric) => ratings[metric.key]));
	}
</script>

<!-- Betyg -->
<div class="glass-panel p-6 sm:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Betygsätt din upplevelse</h2>
	<p class="field-help mt-2 mb-6">Betygsätt varje del från 0 (svagt) till 5 (utmärkt)</p>

	<div class="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
		{#each REVIEW_RATING_METRICS as metric (metric.key)}
			<div class={`flex flex-col ${metric.fullWidth ? 'md:col-span-2' : ''}`}>
				<label for={metric.key} class="field-label">
					{metric.label}
				</label>
				<p class="field-help mt-1 mb-3">{metric.description}</p>
				<div class="slider-container">
					<input
						type="range"
						name={metric.key}
						id={metric.key}
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={ratings[metric.key]}
						oninput={(e) => {
							ratings[metric.key] = Number((e.currentTarget as HTMLInputElement).value);
						}}
					/>
					<div class="slider-labels">
						{#each sliderLabels as n (n)}
							<span>{n}</span>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if afterMetrics}
		<div class="mt-6">
			{@render afterMetrics()}
		</div>
	{/if}

	<div class="mt-8 border-t border-slate-200 pt-6">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<label for="rating" class="field-label"> Helhetsbetyg </label>
				<p class="field-help mt-1">
					Sätt slutbetyget manuellt, eller räkna ut ett förslag från delbetygen.
				</p>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-2xl font-semibold tabular-nums text-slate-900">{rating}/3</span>
				<button type="button" onclick={calculateScore} class="btn btn-secondary">
					Föreslå från delbetyg
				</button>
			</div>
		</div>
		<div class="slider-container mt-4">
			<input
				type="range"
				name="rating"
				id="rating"
				min="0"
				max="3"
				step="1"
				class="w-full rating-slider"
				value={rating}
				oninput={(e) => {
					rating = Number((e.currentTarget as HTMLInputElement).value);
				}}
			/>
			<div class="slider-labels">
				{#each overallRatingLabels as n (n)}
					<span>{n}</span>
				{/each}
			</div>
		</div>
		{#if hasError('rating')}
			<p class="field-error mt-2">
				{getFieldErrorMessage('rating', 'Ogiltigt helhetsbetyg')}
			</p>
		{/if}
	</div>
</div>

<style>
	.slider-container {
		position: relative;
		padding-bottom: 20px;
	}

	.rating-slider {
		height: 8px;
		border-radius: 8px;
		appearance: none;
		cursor: pointer;
		background: var(--color-slate-200);
		outline: none;
		width: 100%;
	}

	.rating-slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--color-amber-700);
		cursor: pointer;
	}

	.rating-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--color-amber-700);
		cursor: pointer;
		border: none;
	}

	.rating-slider:focus-visible {
		outline: 2px solid var(--color-sky-500);
		outline-offset: 4px;
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		padding: 0 2px;
	}

	.slider-labels span {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-slate-500);
		font-variant-numeric: tabular-nums;
		text-align: center;
		min-width: 20px;
	}
</style>
