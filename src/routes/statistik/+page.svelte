<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import BeerValueStatistics from '#lib/components/BeerValueStatistics.svelte';
	import {
		nextBeerBrandSort,
		sortBeerBrands,
		type BeerBrandSort,
		type BeerBrandSortColumn
	} from '#lib/utils/beer-brand-sort.js';

	let { data }: PageProps = $props();
	let brandSort = $state<BeerBrandSort>({ column: 'averagePriceKr', direction: 'asc' });
	const brandColumns = [
		{ key: 'brand', label: 'Ölmärke' },
		{ key: 'averagePriceKr', label: 'Snittpris' },
		{ key: 'reviewCount', label: 'Antal' },
		{ key: 'averageClPerKr', label: 'Snitt cl/kr' }
	] as const;
	const brandValues = $derived(
		new Map(data.statistics.beerBrandValues.map((brand) => [brand.brand, brand]))
	);
	const brandRows = $derived(
		sortBeerBrands(
			data.statistics.beerBrandPrices.map((brand) => ({
				...brand,
				averageClPerKr: brandValues.get(brand.brand)?.averageClPerKr ?? null,
				valueReviewCount: brandValues.get(brand.brand)?.reviewCount ?? 0
			})),
			brandSort
		)
	);

	function sortByBrandColumn(column: BeerBrandSortColumn) {
		brandSort = nextBeerBrandSort(brandSort, column);
	}

	const decimalFormatter = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 1
	});
	const wholeNumberFormatter = new Intl.NumberFormat('sv-SE');
	const percentageFormatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
	const brandPriceFormatter = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	});
	const brandValueFormatter = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	const formatDecimal = (value: number | null): string =>
		value === null ? '–' : decimalFormatter.format(value);
	const formatWholeNumber = (value: number): string => wholeNumberFormatter.format(value);
</script>

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
				Allt bygger på publicerade recensioner. Snittpriser och prisjämförelser bygger på ordinarie
				priser.
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
						<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-4">
							<dt class="min-w-0 flex-1 basis-48">
								<span class="font-semibold text-slate-800">Totalt spenderat</span>
								<span class="mt-0.5 block text-sm text-slate-600">
									En öl per recensent och bar, inklusive happy hour.
								</span>
							</dt>
							<dd
								data-testid="total-reviewer-spend"
								class="max-w-full break-words text-2xl font-semibold tabular-nums text-slate-900"
							>
								{formatWholeNumber(data.statistics.totalReviewerSpendKr)} kr
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
							Happy hour-priser ingår inte i prisstatistiken.
						</p>
					</section>
				{/if}
			</div>
			<BeerValueStatistics statistics={data.statistics} />
			<section
				class="glass-panel -mx-2 mt-6 px-3 py-6 sm:mx-0 sm:p-8"
				aria-labelledby="brand-prices-heading"
			>
				<h2 id="brand-prices-heading" class="text-2xl font-semibold text-slate-900">
					Snittpris per ölmärke
				</h2>
				<p class="field-help mt-2">
					Ordinarie priser från publicerade recensioner. Antal avser prisuppgifter; cl/kr kräver
					även angiven volym.
				</p>
				{#if data.statistics.beerBrandPrices.length}
					<table class="mt-4 w-full table-fixed text-left text-sm">
						<caption class="sr-only"
							>Genomsnittligt pris, antal prisuppgifter och genomsnittlig cl/kr med eget antal
							volymuppgifter per ölmärke</caption
						>
						<colgroup>
							<col class="sm:w-2/5" />
							<col class="w-18 sm:w-1/5" />
							<col class="w-11 sm:w-1/5" />
							<col class="w-22 sm:w-1/5" />
						</colgroup>
						<thead class="border-b border-slate-200 text-slate-600">
							<tr>
								{#each brandColumns as column (column.key)}
									{@const active = brandSort.column === column.key}
									{@const SortIcon = active
										? brandSort.direction === 'asc'
											? ArrowUp
											: ArrowDown
										: ArrowUpDown}
									{@const nextDirection = nextBeerBrandSort(brandSort, column.key).direction}
									<th
										scope="col"
										aria-sort={active
											? brandSort.direction === 'asc'
												? 'ascending'
												: 'descending'
											: undefined}
										class={[
											'align-bottom',
											column.key === 'brand'
												? 'pr-2'
												: column.key === 'reviewCount'
													? 'text-right sm:pl-2'
													: 'pl-2 text-right'
										]}
									>
										<button
											type="button"
											onclick={() => sortByBrandColumn(column.key)}
											aria-label={`Sortera efter ${column.label}, ${nextDirection === 'asc' ? 'stigande' : 'fallande'}`}
											class={[
												'flex min-h-11 w-full cursor-pointer flex-col gap-1 rounded-sm py-3 transition-colors hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 active:text-amber-900 sm:flex-row sm:items-center',
												column.key === 'brand'
													? 'items-start text-left sm:justify-start'
													: 'items-end text-right sm:justify-end',
												active && 'text-amber-800'
											]}
										>
											<span class="max-w-full">{column.label}</span>
											<SortIcon size={14} aria-hidden="true" class="shrink-0" />
										</button>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-200/80">
							{#each brandRows as brand (brand.brand)}
								<tr
									><th scope="row" class="break-words py-4 pr-2 font-medium text-slate-900 sm:py-3"
										>{brand.brand}</th
									>
									<td class="whitespace-nowrap py-4 text-right tabular-nums text-slate-900 sm:py-3"
										>{brandPriceFormatter.format(brand.averagePriceKr)} kr</td
									>
									<td class="py-4 text-right tabular-nums text-slate-700 sm:py-3"
										>{formatWholeNumber(brand.reviewCount)}</td
									>
									<td class="py-4 pl-2 text-right tabular-nums text-slate-900 sm:py-3">
										{#if brand.averageClPerKr !== null}
											{brandValueFormatter.format(brand.averageClPerKr)}
											<span class="mt-1 block text-xs text-slate-600">
												{formatWholeNumber(brand.valueReviewCount)} med volym
											</span>
										{:else}–{/if}
									</td></tr
								>
							{/each}
						</tbody>
					</table>
				{:else}<p class="mt-4 text-slate-600">Inga priser med angivet ölmärke än.</p>{/if}
			</section>
		{/if}
	</div>
</section>
