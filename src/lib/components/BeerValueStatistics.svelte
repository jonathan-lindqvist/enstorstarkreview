<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatClPerKr } from '$lib/utils/beer-value';
	import type { PublicReviewStatistics } from '$lib/types/review-statistics';
	let { statistics }: { statistics: PublicReviewStatistics } = $props();
	const rankings = $derived([
		{ title: 'Mest öl för pengarna', bars: statistics.bestValueBars },
		{ title: 'Minst öl för pengarna', bars: statistics.worstValueBars }
	]);
</script>

<section class="glass-panel mt-6 p-6 sm:p-8" aria-labelledby="beer-value-heading">
	<h2 id="beer-value-heading" class="text-2xl font-semibold text-slate-900">Öl för pengarna</h2>
	<p class="mt-2 text-base leading-relaxed text-slate-600">
		Volym delat med pris, i cl/kr. Högre värde betyder mer öl per krona. Varje recension väger lika
		i snittet. Happy hour-priser ingår inte.
	</p>
	{#if statistics.averageClPerKr === null}
		<p class="mt-4 text-slate-600">Inga recensioner med både volym och pris än.</p>
	{:else}
		<p class="mt-5 text-lg text-slate-900">
			Snitt: <strong class="tabular-nums" data-testid="average-beer-value"
				>{formatClPerKr(statistics.averageClPerKr)}</strong
			>
		</p>
		<p class="mt-1 text-sm text-slate-600">
			Baserat på {statistics.valueReviewCount.toLocaleString('sv-SE')} recensioner med både volym och
			pris.
		</p>
		<div class="mt-7 grid gap-8 md:grid-cols-2">
			{#each rankings as ranking (ranking.title)}
				<section aria-label={ranking.title}>
					<h3 class="text-lg font-semibold text-slate-900">{ranking.title}</h3>
					<ol class="mt-3 divide-y divide-slate-200/80">
						{#each ranking.bars as bar (bar.slug)}
							<li class="flex items-baseline justify-between gap-3 py-3">
								<div class="min-w-0">
									<a
										href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
										class="break-words font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-amber-600"
										>{bar.title}</a
									>
									<p class="mt-1 text-sm tabular-nums text-slate-600">
										{bar.beerVolumeCl} cl · {bar.beerPriceKr} kr{bar.isHappyHourPrice ? '*' : ''}
									</p>
								</div>
								<span
									class="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900"
									>{formatClPerKr(bar.clPerKr)}</span
								>
							</li>
						{/each}
					</ol>
				</section>
			{/each}
		</div>
	{/if}
</section>
