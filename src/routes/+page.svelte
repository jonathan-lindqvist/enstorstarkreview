<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BarAttributeFilters from '$lib/components/BarAttributeFilters.svelte';
	import { matchesBarAttributes, setBarAttributeParams } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import type { PageProps } from './$types';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { SerializedBarReview } from '$lib/types/bar-review';
	import { normalizeReviewSort, sortReviews, type ReviewSort } from '$lib/utils/review-sort';

	const sortOptions: Array<{ value: ReviewSort; label: string }> = [
		{ value: 'latest', label: 'Senaste' },
		{ value: 'oldest', label: 'Äldsta' },
		{ value: 'score', label: 'Högst betyg' }
	];

	let { data }: PageProps = $props();
	let search = $derived(data.search);
	let sort: ReviewSort = $derived(data.sort);
	let attributes: BarAttributeKey[] = $derived(data.attributes);

	const normalize = (value: string) => value.toLowerCase();

	const sortBars = (bars: SerializedBarReview[], selectedSort: ReviewSort) =>
		sortReviews(bars, selectedSort, (bar) => ({
			id: bar._id,
			createdAt: bar.createdAt,
			rating: bar.rating
		}));

	const sortedBars = $derived(sortBars(data.bars, sort));
	const searchText = $derived(
		new Map(
			data.bars.map((bar) => [
				bar._id,
				[
					bar.title,
					bar.location,
					bar.description,
					bar.beerBrand,
					bar.author,
					...(bar.coAuthors ?? [])
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase()
			])
		)
	);

	const searchableBars = $derived.by(() => {
		const query = normalize(search.trim());
		return sortedBars.filter(
			(bar) =>
				matchesBarAttributes(bar.attributes, attributes) &&
				(!query || searchText.get(bar._id)?.includes(query))
		);
	});

	const updateUrl = (nextSearch: string, nextSort: ReviewSort) => {
		// Temporary URL construction in an event handler does not need reactive storage.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(window.location.search);
		const trimmed = nextSearch.trim();

		if (trimmed) {
			params.set('search', trimmed);
		} else {
			params.delete('search');
		}

		if (nextSort === 'latest') {
			params.delete('sort');
		} else {
			params.set('sort', nextSort);
		}
		setBarAttributeParams(params, attributes);

		const query = params.toString();
		const target = resolve(`/${query ? `?${query}` : ''}`);
		replaceState(target, page.state);
	};

	const handleSearch = (value: string) => {
		search = value;
		updateUrl(value, sort);
	};

	const handleSortChange = (event: Event) => {
		const nextSort = normalizeReviewSort((event.currentTarget as HTMLSelectElement).value);
		sort = nextSort;
		updateUrl(search, nextSort);
	};

	const handleAttributesChange = (selected: BarAttributeKey[]) => {
		attributes = selected;
		updateUrl(search, sort);
	};
</script>

<svelte:head>
	<title>En Stor Stark Review</title>
	<meta name="description" content="En Stor Stark Review<" />
</svelte:head>
<section class="relative overflow-hidden">
	<div class="pointer-events-none absolute inset-0 -z-10">
		<div class="absolute -left-24 top-0 h-72 w-72 rounded-full bg-white/80 blur-3xl"></div>
		<div class="absolute right-0 top-20 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl"></div>
		<div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl"></div>
	</div>

	<div class="page-shell">
		<div
			class="rounded-[2rem] border border-white/85 bg-white/65 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_16px_40px_-34px_rgba(148,163,184,0.5)] backdrop-blur-2xl sm:p-8"
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

			<div
				class="mt-6 rounded-2xl border border-white/90 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl sm:p-5"
			>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-0 flex-1 basis-full sm:basis-0">
						<SearchBar value={search} onSearch={handleSearch} />
					</div>
					<label class="flex flex-1 flex-col gap-1 sm:w-48 sm:flex-none">
						<span class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
							Sortera
						</span>
						<select
							value={sort}
							onchange={handleSortChange}
							class="h-11 w-full rounded-2xl border border-white/95 bg-white/90 px-4 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none backdrop-blur-md focus:ring-2 focus:ring-sky-200"
						>
							{#each sortOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
					<BarAttributeFilters selected={attributes} onChange={handleAttributesChange} />
				</div>
			</div>
		</div>

		<div class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each searchableBars as bar (bar._id)}
				<a
					href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
					class="block hover:no-underline"
				>
					<Card
						title={bar.title}
						description={bar.description}
						rating={bar.rating}
						location={bar.location}
						beerBrand={bar.beerBrand}
						beerPriceKr={bar.beerPriceKr}
						isHappyHourPrice={bar.isHappyHourPrice}
						attributes={bar.attributes}
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
		{#if searchableBars.length === 0}
			<p role="status" class="mt-6 rounded-2xl bg-white/70 p-4 text-sm text-slate-600">
				Inga barer matchar dina filter.
			</p>
		{/if}
	</div>
</section>
