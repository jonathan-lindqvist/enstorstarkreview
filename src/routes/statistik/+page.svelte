<script lang="ts">
	import type { PageProps } from './$types';

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

<section class="relative overflow-hidden px-4 pb-14 pt-8 sm:px-8 sm:pt-10">
	<div class="pointer-events-none absolute inset-0 -z-10">
		<div class="absolute -left-24 top-0 h-72 w-72 rounded-full bg-white/80 blur-3xl"></div>
		<div class="absolute right-0 top-20 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl"></div>
		<div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl"></div>
	</div>

	<div
		class="mx-auto w-full max-w-6xl rounded-[2rem] border border-white/85 bg-white/65 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_16px_40px_-34px_rgba(148,163,184,0.5)] backdrop-blur-2xl sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
			En stor stark review
		</p>
		<h1 class="mt-4 text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">
			Statistik för nästa barrunda.
		</h1>
		<p class="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
			Allt bygger på publicerade recensioner. Priser med en asterisk är happy-hour-priser.
		</p>
	</div>

	{#if data.statistics.totalReviews === 0}
		<div
			class="mx-auto mt-8 w-full max-w-6xl rounded-3xl border border-white/85 bg-white/70 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
		>
			<h2 class="text-2xl font-semibold text-slate-900">Ingen statistik än</h2>
			<p class="mt-3 text-sm leading-relaxed text-slate-600">
				Statistiken vaknar till liv när den första recensionen har publicerats.
			</p>
			<a
				href="/"
				class="mt-6 inline-flex rounded-full border border-white/90 bg-white/85 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-white hover:text-slate-900"
			>
				Till recensionerna
			</a>
		</div>
	{:else}
		<div class="mx-auto mt-8 grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
			<div
				class="rounded-3xl border border-white/90 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
			>
				<p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
					Recenserade barer
				</p>
				<p class="mt-3 text-4xl font-bold text-slate-900">
					{formatWholeNumber(data.statistics.totalReviews)}
				</p>
				<p class="mt-2 text-sm text-slate-600">Publicerade ställen att välja mellan.</p>
			</div>

			<div
				class="rounded-3xl border border-white/90 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
			>
				<p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">I Göteborg</p>
				<p class="mt-3 text-4xl font-bold text-slate-900">
					{formatWholeNumber(data.statistics.gothenburgReviews)}
				</p>
				<p class="mt-2 text-sm text-slate-600">Recensioner med Göteborg i adressen.</p>
			</div>

			<div
				class="rounded-3xl border border-white/90 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
			>
				<p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Snittpris</p>
				<p class="mt-3 text-4xl font-bold text-slate-900">
					{#if data.statistics.averageBeerPrice === null}
						–
					{:else}
						{formatDecimal(data.statistics.averageBeerPrice)} kr
					{/if}
				</p>
				<p class="mt-2 text-sm text-slate-600">
					Baserat på {formatWholeNumber(data.statistics.priceReviewCount)} prisuppgifter.
				</p>
			</div>

			<div
				class="rounded-3xl border border-white/90 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
			>
				<p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Snittbetyg</p>
				<p class="mt-3 text-4xl font-bold text-slate-900">
					{formatDecimal(data.statistics.averageRating)}<span class="text-2xl">/3</span>
				</p>
				<p class="mt-2 text-sm text-slate-600">Helhetsintrycket från alla publicerade barer.</p>
			</div>

			<div
				class="rounded-3xl border border-white/90 bg-white/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
			>
				<p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
					Happy hour-fynd
				</p>
				<p class="mt-3 text-4xl font-bold text-slate-900">
					{formatWholeNumber(data.statistics.happyHourReviewCount)}
				</p>
				<p class="mt-2 text-sm text-slate-600">
					{#if data.statistics.happyHourPercentage === null}
						Inga prisuppgifter än.
					{:else}
						{percentageFormatter.format(data.statistics.happyHourPercentage)} % av prisuppgifterna.
					{/if}
				</p>
			</div>
		</div>

		{#if data.statistics.cheapestBars.length && data.statistics.mostExpensiveBars.length}
			<div class="mx-auto mt-5 grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2">
				<section
					class="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(16,185,129,0.35)] backdrop-blur-xl"
				>
					<p class="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
						Billigast
					</p>
					<h2 class="mt-3 text-4xl font-bold text-slate-900">
						{data.statistics.cheapestBars[0].beerPriceKr} kr
					</h2>
					<ul class="mt-5 space-y-2">
						{#each data.statistics.cheapestBars as bar (bar.slug)}
							<li>
								<a
									href={`/${encodeURIComponent(bar.slug)}`}
									class="inline-flex text-sm font-semibold text-slate-800 underline decoration-emerald-300 decoration-2 underline-offset-4 transition hover:text-emerald-800"
								>
									{bar.title}{bar.isHappyHourPrice ? ' *' : ''}
								</a>
							</li>
						{/each}
					</ul>
				</section>

				<section
					class="rounded-3xl border border-rose-100 bg-rose-50/70 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(244,63,94,0.3)] backdrop-blur-xl"
				>
					<p class="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">Dyrast</p>
					<h2 class="mt-3 text-4xl font-bold text-slate-900">
						{data.statistics.mostExpensiveBars[0].beerPriceKr} kr
					</h2>
					<ul class="mt-5 space-y-2">
						{#each data.statistics.mostExpensiveBars as bar (bar.slug)}
							<li>
								<a
									href={`/${encodeURIComponent(bar.slug)}`}
									class="inline-flex text-sm font-semibold text-slate-800 underline decoration-rose-300 decoration-2 underline-offset-4 transition hover:text-rose-800"
								>
									{bar.title}{bar.isHappyHourPrice ? ' *' : ''}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			</div>

			<p class="mx-auto mt-4 w-full max-w-6xl text-xs leading-relaxed text-slate-500">
				* Pris registrerat under happy hour. Det ingår i prisstatistiken.
			</p>
		{/if}
	{/if}
</section>
