<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';

	let { data }: PageProps = $props();

	const decimalFormatter = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 1
	});
	const wholeNumberFormatter = new Intl.NumberFormat('sv-SE');
	const percentageFormatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

	const formatDecimal = (value: number | null): string =>
		value === null ? '–' : decimalFormatter.format(value);
	const formatWholeNumber = (value: number): string => wholeNumberFormatter.format(value);
</script>

<svelte:head>
	<title>Statistik</title>
	<meta
		name="description"
		content="Rolig statistik från publicerade recensioner på En Stor Stark Review"
	/>
</svelte:head>

<section>
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:opacity-30">
		<div class="absolute -left-24 top-0 h-72 w-72 rounded-full bg-white/80 blur-3xl"></div>
		<div class="absolute right-0 top-20 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl"></div>
		<div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl"></div>
	</div>

	<div class="page-shell">
		<div class="max-w-3xl">
			<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-5xl">
				Statistik för nästa barrunda.
			</h1>
			<p class="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
				Allt bygger på publicerade recensioner. Priser med en asterisk är happy-hour-priser.
			</p>
		</div>

		{#if data.statistics.totalReviews === 0}
			<div class="glass-panel mt-8 p-8 text-center">
				<h2 class="text-2xl font-semibold text-slate-900">Ingen statistik än</h2>
				<p class="mt-3 text-slate-600">
					Statistiken vaknar till liv när den första recensionen har publicerats.
				</p>
				<a href={resolve('/')} class="btn btn-secondary mt-6">Till recensionerna</a>
			</div>
		{:else}
			{@const hasPriceLists =
				data.statistics.cheapestBars.length > 0 && data.statistics.mostExpensiveBars.length > 0}
			<div class={['mt-8 grid items-start gap-6', hasPriceLists && 'lg:grid-cols-2']}>
				<section class="glass-panel p-6 sm:p-8" aria-labelledby="overview-heading">
					<h2 id="overview-heading" class="text-2xl font-semibold text-slate-900">Överblick</h2>
					<dl class="mt-4 divide-y divide-slate-200/80">
						<div class="flex items-baseline justify-between gap-6 py-4">
							<dt>
								<span class="font-semibold text-slate-800">Recenserade barer</span>
								<span class="mt-0.5 block text-sm text-slate-600">
									Publicerade ställen att välja mellan.
								</span>
							</dt>
							<dd class="text-2xl font-semibold tabular-nums text-slate-900">
								{formatWholeNumber(data.statistics.totalReviews)}
							</dd>
						</div>
						<div class="flex items-baseline justify-between gap-6 py-4">
							<dt>
								<span class="font-semibold text-slate-800">I Göteborg</span>
								<span class="mt-0.5 block text-sm text-slate-600">
									Recensioner med Göteborg i adressen.
								</span>
							</dt>
							<dd class="text-2xl font-semibold tabular-nums text-slate-900">
								{formatWholeNumber(data.statistics.gothenburgReviews)}
							</dd>
						</div>
						<div class="flex items-baseline justify-between gap-6 py-4">
							<dt>
								<span class="font-semibold text-slate-800">Snittpris</span>
								<span class="mt-0.5 block text-sm text-slate-600">
									Baserat på {formatWholeNumber(data.statistics.priceReviewCount)} prisuppgifter.
								</span>
							</dt>
							<dd class="whitespace-nowrap text-2xl font-semibold tabular-nums text-slate-900">
								{#if data.statistics.averageBeerPrice === null}
									–
								{:else}
									{formatDecimal(data.statistics.averageBeerPrice)} kr
								{/if}
							</dd>
						</div>
						<div class="flex items-baseline justify-between gap-6 py-4">
							<dt>
								<span class="font-semibold text-slate-800">Snittbetyg</span>
								<span class="mt-0.5 block text-sm text-slate-600">
									Helhetsintrycket från alla publicerade barer.
								</span>
							</dt>
							<dd class="whitespace-nowrap text-2xl font-semibold tabular-nums text-slate-900">
								{formatDecimal(data.statistics.averageRating)}<span class="text-base text-slate-600"
									>/3</span
								>
							</dd>
						</div>
						<div class="flex items-baseline justify-between gap-6 py-4">
							<dt>
								<span class="font-semibold text-slate-800">Happy hour-fynd</span>
								<span class="mt-0.5 block text-sm text-slate-600">
									{#if data.statistics.happyHourPercentage === null}
										Inga prisuppgifter än.
									{:else}
										{percentageFormatter.format(data.statistics.happyHourPercentage)} % av prisuppgifterna.
									{/if}
								</span>
							</dt>
							<dd class="text-2xl font-semibold tabular-nums text-slate-900">
								{formatWholeNumber(data.statistics.happyHourReviewCount)}
							</dd>
						</div>
					</dl>
				</section>

				{#if hasPriceLists}
					<section class="glass-panel p-6 sm:p-8" aria-labelledby="prices-heading">
						<h2 id="prices-heading" class="text-2xl font-semibold text-slate-900">
							Billigast och dyrast
						</h2>
						<div class="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
							<section aria-labelledby="cheapest-heading">
								<h3 id="cheapest-heading" class="text-lg font-semibold text-slate-900">
									Billigast,
									<span class="tabular-nums">{data.statistics.cheapestBars[0].beerPriceKr} kr</span>
								</h3>
								<ul class="mt-3 space-y-2">
									{#each data.statistics.cheapestBars as bar (bar.slug)}
										<li>
											<a
												href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
												class="font-medium text-slate-800 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900 hover:decoration-amber-600"
											>
												{bar.title}{bar.isHappyHourPrice ? ' *' : ''}
											</a>
										</li>
									{/each}
								</ul>
							</section>

							<section aria-labelledby="most-expensive-heading">
								<h3 id="most-expensive-heading" class="text-lg font-semibold text-slate-900">
									Dyrast,
									<span class="tabular-nums"
										>{data.statistics.mostExpensiveBars[0].beerPriceKr} kr</span
									>
								</h3>
								<ul class="mt-3 space-y-2">
									{#each data.statistics.mostExpensiveBars as bar (bar.slug)}
										<li>
											<a
												href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
												class="font-medium text-slate-800 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900 hover:decoration-amber-600"
											>
												{bar.title}{bar.isHappyHourPrice ? ' *' : ''}
											</a>
										</li>
									{/each}
								</ul>
							</section>
						</div>
						<p class="mt-6 text-sm leading-relaxed text-slate-600">
							* Pris registrerat under happy hour. Det ingår i prisstatistiken.
						</p>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</section>
