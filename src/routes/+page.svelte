<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BarAttributeFilters from '$lib/components/BarAttributeFilters.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import type { PageProps } from './$types';
	import type { Snapshot } from '@sveltejs/kit';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import { getBrowserPreferences } from '$lib/preferences';
	import { normalizeHomeReviewSort } from '$lib/utils/home-review-sort';
	import type { HomeReviewSort } from '$lib/types/home-review-sort';
	import type { UserLocationState } from '$lib/types/review-location';
	import type { HomeReviewQuery } from '$lib/types/home-reviews';
	import { watchUserLocation } from '$lib/client/user-location';
	import { distanceKm } from '$lib/utils/review-distance';
	import {
		createHomeReviewListing,
		initialHomeListingState
	} from '$lib/client/home-review-listing';
	import type { HomeListingState } from '$lib/client/home-review-listing';
	import { homeReviewHref, normalizeHomeReviewQuery } from '$lib/home-reviews';
	import { publicReviewListSchema, jsonLdScript } from '$lib/seo';

	const sortOptions: Array<{ value: HomeReviewSort; label: string }> = [
		{ value: 'latest', label: 'Senaste' },
		{ value: 'oldest', label: 'Äldsta' },
		{ value: 'score', label: 'Högst betyg' },
		{ value: 'nearest', label: 'Närmast' }
	];
	let { data }: PageProps = $props();
	let search = $state(untrack(() => data.search));
	let sort: HomeReviewSort = $state(untrack(() => data.sort));
	let attributes: BarAttributeKey[] = $state(untrack(() => data.attributes));
	let listing = $state(untrack(() => initialHomeListingState(data, data)));
	let enhanced = $state(false);
	let userLocation = $state<UserLocationState>(
		untrack(() => ({ position: null, error: null, disabled: !data.locationEnabled }))
	);
	const controller = createHomeReviewListing({
		initial: untrack(() => data),
		query: untrack(() => data),
		onChange: (state) => (listing = state),
		fetcher: (...args) => fetch(...args)
	});
	let previousData = untrack(() => data);
	$effect(() => {
		const next = data;
		if (next === previousData) return;
		previousData = next;
		untrack(() => {
			search = next.search;
			sort = next.sort;
			attributes = next.attributes;
			controller.restore(initialHomeListingState(next, next));
		});
	});
	onMount(() => {
		enhanced = typeof IntersectionObserver !== 'undefined';
		userLocation.disabled = !getBrowserPreferences().locationEnabled;
		const stop = watchUserLocation((state) => {
			userLocation = state;
			controller.setPosition(state.position);
		});
		return () => {
			stop();
			controller.dispose();
		};
	});
	const distances = $derived(
		new Map(
			listing.bars.map((bar) => [
				bar._id,
				distanceKm(userLocation.position, listing.coordinatesByReviewId[bar._id])
			])
		)
	);

	function changeQuery(delay = 0) {
		const query: HomeReviewQuery = { search, sort, attributes, page: 1 };
		replaceState(resolve(homeReviewHref(query)), page.state);
		controller.setQuery(query, delay);
	}
	function handleSearch(value: string) {
		search = value;
		changeQuery(250);
	}
	function handleSortChange(event: Event) {
		sort = normalizeHomeReviewSort((event.currentTarget as HTMLSelectElement).value);
		changeQuery();
	}
	function handleAttributesChange(selected: BarAttributeKey[]) {
		attributes = selected;
		changeQuery();
	}
	function observeMore(node: HTMLElement) {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void controller.loadMore();
			},
			{ rootMargin: '600px' }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
	function retryLoading() {
		void controller.retry();
	}

	export const snapshot: Snapshot<{
		listing: HomeListingState;
		username: string | null;
		scroll: { x: number; y: number };
	}> = {
		capture: () => ({
			listing: controller.capture(),
			username: data.user?.username ?? null,
			scroll: { x: window.scrollX, y: window.scrollY }
		}),
		restore: (saved) => {
			const params = normalizeHomeReviewQuery(page.url.searchParams);
			params.page = Number(page.url.searchParams.get('page')) || 1;
			if (
				saved.username !== (data.user?.username ?? null) ||
				homeReviewHref(saved.listing.query) !== homeReviewHref(params)
			)
				return;
			search = saved.listing.query.search;
			sort = saved.listing.query.sort;
			attributes = saved.listing.query.attributes;
			controller.restore(saved.listing);
			// The restored cards must exist before scrolling beyond the first server-rendered batch.
			void tick().then(() => window.scrollTo(saved.scroll.x, saved.scroll.y));
		}
	};
</script>

<svelte:head>
	{#if !listing.query.search && !listing.query.attributes.length && listing.query.sort === 'latest'}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON escapes HTML delimiters before insertion into an inert data block. -->
		{@html jsonLdScript(publicReviewListSchema(listing.bars, listing.query.page))}
	{/if}
</svelte:head>

<section>
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:opacity-30">
		<div class="absolute -left-24 top-0 h-72 w-72 rounded-full bg-white/80 blur-3xl"></div>
		<div class="absolute right-0 top-20 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl"></div>
		<div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl"></div>
	</div>

	<div class="page-shell">
		<div>
			<h1 class="max-w-3xl text-balance text-2xl font-semibold text-slate-900 sm:text-3xl">
				Barrecensioner i Göteborg
			</h1>
			<p class="mt-2 max-w-prose text-base leading-relaxed text-slate-600">
				Vi beställer en stor stark och skriver vad vi tycker. Ibland på annan ort.
				<a
					href={`${resolve('/about')}#sa-recenserar-vi`}
					class="rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
					>Så recenserar vi</a
				>.
			</p>

			<div class="mt-4 flex flex-wrap items-end gap-3">
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
					{#if userLocation.disabled}
						Platsåtkomst är avstängd. Ändra i
						<a href={resolve('/installningar')} class="font-semibold underline underline-offset-4"
							>Inställningar</a
						>.
					{:else}
						{userLocation.error ?? 'Hämtar din position…'}
					{/if}
					Visar senaste recensionerna tills din position är tillgänglig.
				</p>
			{:else if userLocation.error}
				<p class="mt-3 text-sm text-slate-600">{userLocation.error}</p>
			{/if}
		</div>

		<div class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each listing.bars as bar, index (bar._id)}
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
						imageLoading={index === 0 ? 'eager' : 'lazy'}
						imagePriority={index === 0 ? 'high' : 'auto'}
						imageFocusX={bar.imageFocusX}
						imageFocusY={bar.imageFocusY}
						publicationStatus={bar.publicationStatus}
						showPublicationStatus={data.showPublicationStatus}
						distanceKm={distances.get(bar._id)}
					/>
				</a>
			{/each}
		</div>
		{#if listing.bars.length === 0 && !listing.loading && !listing.error}
			<div class="mt-6 text-center">
				<p role="status" class="font-semibold text-slate-900">Inga barer matchar dina filter.</p>
				<p class="mt-1 text-sm text-slate-600">Prova en annan sökning eller rensa filtren.</p>
			</div>
		{/if}
		{#if listing.loading}
			<p role="status" class="mt-6 text-center text-sm text-slate-600">Hämtar recensioner…</p>
		{:else if listing.error}
			<div class="mt-6 text-center">
				<p role="alert" class="text-sm text-slate-600">{listing.error}</p>
				<button type="button" class="btn btn-secondary mt-3" onclick={retryLoading}
					>Försök igen</button
				>
			</div>
		{/if}
		{#if listing.nextPage && !listing.error && !listing.loading}
			<div use:observeMore class="h-px" aria-hidden="true"></div>
		{/if}
		{#if !enhanced && (data.page > 1 || data.nextPage)}
			<nav
				aria-label="Recensionssidor"
				class="mt-6 flex justify-center gap-4"
				data-sveltekit-preload-data="off"
			>
				{#if data.page > 1}<a
						class="btn btn-secondary"
						href={resolve(homeReviewHref({ ...data, page: data.page - 1 }))}
						>Föregående recensioner</a
					>{/if}
				{#if data.nextPage}<a
						class="btn btn-secondary"
						href={resolve(homeReviewHref({ ...data, page: data.nextPage }))}>Fler recensioner</a
					>{/if}
			</nav>
		{/if}
	</div>
</section>
