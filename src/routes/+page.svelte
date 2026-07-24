<script lang="ts">
	import { goto } from '$app/navigation';
	import Pagination from '$lib/components/Pagination.svelte';
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchX from '@lucide/svelte/icons/search-x';
	import { onDestroy } from 'svelte';
	import type { PageData } from './$types';

	type ReviewSort = 'latest' | 'oldest' | 'score';

	const SEARCH_DEBOUNCE_MS = 300;
	const sortOptions: Array<{ value: ReviewSort; label: string }> = [
		{ value: 'latest', label: 'Senaste' },
		{ value: 'oldest', label: 'Äldsta' },
		{ value: 'score', label: 'Högst betyg' }
	];

	const normalizeSort = (value: string | null | undefined): ReviewSort => {
		if (value === 'oldest' || value === 'score') return value;
		return 'latest';
	};

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	let search = $state(data.search);
	// svelte-ignore state_referenced_locally
	let sort = $state<ReviewSort>(normalizeSort(data.sort));
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;

	const getHomeHref = (nextSearch: string, nextSort: ReviewSort, page = 1): string => {
		const params = new URLSearchParams();
		const trimmedSearch = nextSearch.trim();

		if (trimmedSearch) params.set('search', trimmedSearch);
		if (nextSort !== 'latest') params.set('sort', nextSort);
		if (page > 1) params.set('page', String(page));

		const query = params.toString();
		return query ? `/?${query}` : '/';
	};

	const clearSearchTimeout = () => {
		if (!searchTimeout) return;
		clearTimeout(searchTimeout);
		searchTimeout = undefined;
	};

	const visitFirstPage = (nextSearch: string, nextSort: ReviewSort, replaceState = false) => {
		void goto(getHomeHref(nextSearch, nextSort), {
			keepFocus: true,
			noScroll: true,
			replaceState
		});
	};

	const handleSearchInput = (value: string) => {
		search = value;
		clearSearchTimeout();
		searchTimeout = setTimeout(() => {
			visitFirstPage(value, sort, true);
			searchTimeout = undefined;
		}, SEARCH_DEBOUNCE_MS);
	};

	const handleSearchSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		clearSearchTimeout();
		visitFirstPage(search, sort);
	};

	const handleSortChange = (event: Event) => {
		clearSearchTimeout();
		const nextSort = normalizeSort((event.currentTarget as HTMLSelectElement).value);
		sort = nextSort;
		visitFirstPage(search, nextSort);
	};

	const getPageHref = (targetPage: number) => getHomeHref(search, sort, targetPage);

	const resultSummary = $derived.by(() => {
		if (data.totalResults === 0) {
			return search ? 'Inga recensioner matchar din sökning.' : 'Inga recensioner att visa.';
		}

		const firstResult = (data.page - 1) * data.pageSize + 1;
		const lastResult = Math.min(data.page * data.pageSize, data.totalResults);
		const reviewLabel = data.totalResults === 1 ? 'recension' : 'recensioner';
		return `Visar ${firstResult}–${lastResult} av ${data.totalResults} ${reviewLabel}.`;
	});

	$effect(() => {
		search = data.search;
		sort = normalizeSort(data.sort);
	});

	onDestroy(clearSearchTimeout);
</script>

<svelte:head>
	<title>En Stor Stark Review</title>
	<meta name="description" content="En Stor Stark Review" />
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
		<h1 class="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">
			Hitta baren med bäst känsla, bäst service och kallast stor stark.
		</h1>
		<p class="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
			Recensioner med fokus på helhetsupplevelsen. Snabbt att skumma, enkelt att jämföra och byggt
			för att hitta rätt ställe för nästa kväll.
		</p>

		<form
			method="get"
			onsubmit={handleSearchSubmit}
			class="mt-6 rounded-2xl border border-white/90 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl sm:p-5"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div class="min-w-0 flex-1">
					<SearchBar value={search} onInput={handleSearchInput} />
				</div>
				<label class="flex shrink-0 flex-col gap-1 sm:w-48">
					<span class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
						Sortera
					</span>
					<select
						name="sort"
						value={sort}
						onchange={handleSortChange}
						class="h-11 w-full rounded-2xl border border-white/95 bg-white/90 px-4 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none backdrop-blur-md focus:ring-2 focus:ring-sky-200"
					>
						{#each sortOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</div>
		</form>
	</div>

	<div class="mx-auto mt-6 flex w-full max-w-6xl items-center justify-between gap-4">
		<p aria-live="polite" class="text-sm font-medium text-slate-600">{resultSummary}</p>
		{#if search}
			<a
				href={getHomeHref('', sort)}
				class="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 underline decoration-sky-300 decoration-2 underline-offset-4 transition hover:text-slate-900"
			>
				Rensa sökning
			</a>
		{/if}
	</div>

	{#if data.bars.length}
		<div class="mx-auto mt-5 grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.bars as bar (bar._id)}
				<a href={`/${encodeURIComponent(bar.slug)}`} class="block hover:no-underline">
					<Card
						title={bar.title}
						description={bar.description}
						rating={bar.rating}
						location={bar.location}
						beerPriceKr={bar.beerPriceKr}
						isHappyHourPrice={bar.isHappyHourPrice}
						image={bar.image}
						imageFocusX={bar.imageFocusX}
						imageFocusY={bar.imageFocusY}
						author={bar.author}
						coAuthors={bar.coAuthors}
						publicationStatus={bar.publicationStatus}
						showPublicationStatus={data.showPublicationStatus}
					/>
				</a>
			{/each}
		</div>

		<Pagination page={data.page} pageCount={data.pageCount} {getPageHref} />
	{:else}
		<div
			class="mx-auto mt-5 flex w-full max-w-6xl flex-col items-center rounded-3xl border border-white/85 bg-white/70 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-10"
		>
			<SearchX size={34} strokeWidth={1.6} class="text-slate-500" aria-hidden="true" />
			<h2 class="mt-4 text-2xl font-semibold text-slate-900">Inga träffar just nu</h2>
			<p class="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
				Prova ett annat namn, område eller ord från recensionen.
			</p>
			{#if search}
				<a
					href={getHomeHref('', sort)}
					class="mt-6 inline-flex h-11 items-center rounded-full border border-white/90 bg-white/85 px-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					Rensa sökning
				</a>
			{/if}
		</div>
	{/if}
</section>
