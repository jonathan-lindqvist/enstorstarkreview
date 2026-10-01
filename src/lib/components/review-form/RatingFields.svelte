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
<div
	class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
>
	<h2 class="text-lg font-semibold text-slate-900 mb-3">Betygsätt din upplevelse</h2>
	<p class="text-sm text-slate-500 mb-6">Betygsätt varje del från 0 (svagt) till 5 (utmärkt)</p>

	<div class="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
		{#each REVIEW_RATING_METRICS as metric}
			<div class={`flex flex-col ${metric.fullWidth ? 'md:col-span-2' : ''}`}>
				<label
					for={metric.key}
					class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>
					{metric.label}
				</label>
				<p class="text-xs text-slate-500 mb-2">{metric.description}</p>
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
						{#each sliderLabels as n}
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

	<div
		class="mt-6 rounded-2xl border border-white/85 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<label for="rating" class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
					Helhetsbetyg
				</label>
				<p class="mt-1 text-xs text-slate-500">
					Sätt slutbetyget manuellt, eller räkna ut ett förslag från delbetygen.
				</p>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-2xl font-semibold text-slate-900">{rating}/3</span>
				<button
					type="button"
					onclick={calculateScore}
					class="rounded-full border border-white/85 bg-white/82 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 transition hover:bg-white"
				>
					Räkna ut score
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
				{#each overallRatingLabels as n}
					<span>{n}</span>
				{/each}
			</div>
		</div>
		{#if hasError('rating')}
			<p class="text-red-400 text-xs mt-1">
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
		background: #e2e8f0;
		outline: none;
		width: 100%;
	}

	.rating-slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #cbd5e1;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.rating-slider::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.rating-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #cbd5e1;
		cursor: pointer;
		border: none;
		transition: transform 0.1s;
	}

	.rating-slider::-moz-range-thumb:hover {
		transform: scale(1.2);
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
		color: #64748b;
		text-align: center;
		min-width: 20px;
	}
</style>
