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
	import { onMount } from 'svelte';
	import { normalizeHomeReviewSort, sortHomeReviews } from '$lib/utils/home-review-sort';
	import type { HomeReviewSort } from '$lib/types/home-review-sort';
	import type { UserLocationState } from '$lib/types/review-location';
	import { watchUserLocation } from '$lib/client/user-location';
	import { distanceKm } from '$lib/utils/review-distance';

	const sortOptions: Array<{ value: HomeReviewSort; label: string }> = [
		{ value: 'latest', label: 'Senaste' },
		{ value: 'oldest', label: 'Äldsta' },
		{ value: 'score', label: 'Högst betyg' },
		{ value: 'nearest', label: 'Närmast' }
	];

	let { data }: PageProps = $props();
	let search = $derived(data.search);
	let sort: HomeReviewSort = $derived(data.sort);
	let attributes: BarAttributeKey[] = $derived(data.attributes);
	let userLocation = $state<UserLocationState>({ position: null, error: null });
	onMount(() => watchUserLocation((state) => (userLocation = state)));
	const distances = $derived(
		new Map(
			data.bars.map((bar) => [
				bar._id,
				distanceKm(userLocation.position, data.coordinatesByReviewId[bar._id])
			])
		)
	);

	const normalize = (value: string) => value.toLowerCase();

	const sortBars = (bars: SerializedBarReview[], selectedSort: HomeReviewSort) =>
		sortHomeReviews(bars, selectedSort, (bar) => ({
			id: bar._id,
			createdAt: bar.createdAt,
			rating: bar.rating,
			distanceKm: distances.get(bar._id)
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

	const updateUrl = (nextSearch: string, nextSort: HomeReviewSort) => {
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
		const nextSort = normalizeHomeReviewSort((event.currentTarget as HTMLSelectElement).value);
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
	<meta
		name="description"
		content="Recensioner av barer i Göteborg med fokus på helhetsupplevelsen och priset på en stor stark."
	/>
</svelte:head>
<section>
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:opacity-30">
		<div class="absolute -left-24 top-0 h-72 w-72 rounded-full bg-white/80 blur-3xl"></div>
		<div class="absolute right-0 top-20 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl"></div>
		<div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl"></div>
	</div>

	<div class="page-shell">
		<div class="glass-panel p-6 sm:p-8">
			<h1 class="max-w-3xl text-balance text-3xl font-semibold text-slate-900 sm:text-5xl">
				Hitta baren med bäst känsla, bäst service och kallast stor stark.
			</h1>
			<p class="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
				Recensioner med fokus på helhetsupplevelsen. Snabbt att skumma, enkelt att jämföra och byggt
				för att hitta rätt ställe för nästa kväll.
			</p>

			<div class="mt-8 flex flex-wrap items-end gap-3">
				<div class="min-w-0 flex-1 basis-full sm:basis-0">
					<SearchBar value={search} onSearch={handleSearch} />
				</div>
				<label class="flex flex-1 flex-col gap-2 sm:w-48 sm:flex-none">
					<span class="field-label">Sortera</span>
					<select value={sort} onchange={handleSortChange} class="field">
						{#each sortOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
				<BarAttributeFilters selected={attributes} onChange={handleAttributesChange} />
			</div>
			{#if sort === 'nearest' && !userLocation.position}
				<p role="status" class="mt-3 text-sm text-slate-600">
					{userLocation.error ?? 'Hämtar din position…'}
					Visar senaste recensionerna tills din position är tillgänglig.
				</p>
			{:else if userLocation.error}
				<p class="mt-3 text-sm text-slate-600">{userLocation.error}</p>
			{/if}
		</div>

		<div class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each searchableBars as bar (bar._id)}
				<a
					href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
					class="row-span-4 grid grid-rows-subgrid gap-y-0 hover:no-underline"
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
						publicationStatus={bar.publicationStatus}
						showPublicationStatus={data.showPublicationStatus}
						distanceKm={distances.get(bar._id)}
					/>
				</a>
			{/each}
		</div>
		{#if searchableBars.length === 0}
			<div class="mt-6 text-center">
				<p role="status" class="font-semibold text-slate-900">Inga barer matchar dina filter.</p>
				<p class="mt-1 text-sm text-slate-600">Prova en annan sökning eller rensa filtren.</p>
			</div>
		{/if}
	</div>
</section>
