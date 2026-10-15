<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { NearbyReviewComparison } from '$lib/types/nearby-reviews';
	import type { Coordinates } from '$lib/types/review-location';
	import { normalizeMapAddress } from '$lib/utils/map-address';
	import { getNearbyReviewSummary, NEARBY_REVIEW_RADII_METRES } from '$lib/utils/nearby-reviews';
	import { watchUserLocation } from '$lib/client/user-location';
	import { getBrowserPreferences, onPreferencesChange } from '$lib/preferences';

	interface Props {
		address: string;
		comparison?: NearbyReviewComparison;
	}
	let { address, comparison }: Props = $props();
	let browserPosition = $state<Coordinates | null>(null);
	let locationError = $state<string | null>(null);
	let locating = $state(false);
	let locationDisabled = $state(false);
	let stopWatch: () => void = () => {};
	let generation = 0;
	const savedPosition = $derived.by(() => {
		const positions = comparison?.coordinatesByAddress;
		const key = normalizeMapAddress(address);
		return positions && Object.hasOwn(positions, key) ? positions[key] : null;
	});
	const center = $derived(savedPosition ?? browserPosition);
	const summary = $derived(
		comparison?.available ? getNearbyReviewSummary(center, comparison.reviews) : null
	);
	const metreFormatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

	function resetPosition() {
		generation += 1;
		stopWatch();
		browserPosition = null;
		locationError = null;
		locating = false;
	}

	$effect(() => {
		void address;
		resetPosition();
	});
	onDestroy(() => {
		generation += 1;
		stopWatch();
	});

	onMount(() => {
		function synchronizePreference() {
			const disabled = !getBrowserPreferences().locationEnabled;
			if (disabled && !locationDisabled) resetPosition();
			locationDisabled = disabled;
		}
		synchronizePreference();
		return onPreferencesChange(synchronizePreference);
	});

	function useMyPosition() {
		resetPosition();
		const requestGeneration = generation;
		locating = true;
		stopWatch = watchUserLocation((state) => {
			if (generation !== requestGeneration) return;
			browserPosition = state.position;
			locationError = state.error;
			locationDisabled = state.disabled;
			locating = false;
			// Also supports a browser that reports an error synchronously during registration.
			queueMicrotask(() => {
				if (generation === requestGeneration) stopWatch();
			});
		});
	}
</script>

<section class="mt-5 border-t border-slate-200 pt-4" aria-label="Recenserade barer i närheten">
	<h3 class="text-base font-semibold text-slate-900">Recenserade barer i närheten</h3>
	{#if !comparison?.available}
		<p class="field-help mt-2">
			Jämförelsen kunde inte laddas just nu. Du kan ändå sätta ditt betyg.
		</p>
	{:else}
		{#if !savedPosition}
			<p class="field-help mt-2">
				Adressen saknar sparad position. Om du är vid baren kan du jämföra från din position.
			</p>
			<button
				type="button"
				class="btn btn-secondary mt-3"
				onclick={useMyPosition}
				disabled={locating || locationDisabled}
			>
				{locating ? 'Hämtar din position…' : 'Använd min position'}
			</button>
		{/if}
		<div role="status" aria-live="polite">
			{#if locationDisabled}
				<p class="field-help mt-2">
					Platsåtkomst är avstängd. Ändra i
					<a href={resolve('/installningar')} class="font-semibold underline underline-offset-4"
						>Inställningar</a
					>.
				</p>
			{/if}
			{#if locationError}<p class="field-error mt-2">{locationError}</p>{/if}
			{#if summary}
				<p class="field-help mt-3">
					{savedPosition
						? 'Jämförelsen utgår från adressens sparade position.'
						: 'Jämförelsen utgår från din position.'} Avstånden är ungefärliga och fågelvägen.
				</p>
				<dl class="mt-3 grid grid-cols-3 gap-3">
					{#each NEARBY_REVIEW_RADII_METRES as radius, index (radius)}
						<div>
							<dt class="text-sm text-slate-600">Inom {metreFormatter.format(radius)} m</dt>
							<dd class="text-xl font-semibold tabular-nums text-slate-900">
								{summary.counts[index]}
							</dd>
						</div>
					{/each}
				</dl>
				<p class="field-help mt-3">
					{summary.locatedCount} av {summary.totalCount} andra recensioner har känd position. Utkast
					ingår. Den här recensionen räknas inte.
				</p>
				{#if summary.nearest.length}
					<ul class="mt-3 space-y-2">
						{#each summary.nearest as bar (bar.id)}
							<li class="flex items-baseline justify-between gap-3">
								<a
									class="min-w-0 break-words text-sm font-medium text-slate-800 underline underline-offset-4"
									href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}>{bar.title}</a
								><span class="shrink-0 text-sm tabular-nums text-slate-600"
									>{metreFormatter.format(bar.distanceKm * 1000)} m</span
								>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if center}
				<p class="field-help mt-3">
					Andra recensioner saknar kända positioner. Antalet barer i närheten kan inte beräknas.
				</p>
			{/if}
		</div>
	{/if}
</section>
