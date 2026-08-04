<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import type { SerializedBarReview } from '$lib/types/bar-review';

	type ReviewSort = 'latest' | 'oldest' | 'score';

	const sortOptions: Array<{ value: ReviewSort; label: string }> = [
		{ value: 'latest', label: 'Senaste' },
		{ value: 'oldest', label: 'Äldsta' },
		{ value: 'score', label: 'Högst betyg' }
	];

	let { data } = $props();
	let search = $state('');
	let sort = $state<ReviewSort>('latest');

	$effect(() => {
		search = (data as { search?: string }).search ?? '';
		sort = normalizeSort((data as { sort?: string }).sort);
	});

	const normalize = (value: string) => value.toLowerCase();
	const normalizeSort = (value: string | null | undefined): ReviewSort => {
		if (value === 'oldest' || value === 'score') return value;
		return 'latest';
	};

	const getCreatedTime = (bar: SerializedBarReview) => {
		const createdTime = new Date(bar.createdAt).getTime();
		return Number.isFinite(createdTime) ? createdTime : 0;
	};

	const compareByCreated = (
		first: SerializedBarReview,
		second: SerializedBarReview,
		direction: 'asc' | 'desc'
	) => {
		const firstCreated = getCreatedTime(first);
		const secondCreated = getCreatedTime(second);
		const createdDiff = firstCreated - secondCreated;

		if (createdDiff !== 0) {
			return direction === 'asc' ? createdDiff : -createdDiff;
		}

		return direction === 'asc'
			? first._id.localeCompare(second._id)
			: second._id.localeCompare(first._id);
	};

	const sortBars = (bars: SerializedBarReview[], selectedSort: ReviewSort) => {
		return [...bars].sort((first, second) => {
			if (selectedSort === 'score') {
				const ratingDiff = second.rating - first.rating;
				if (ratingDiff !== 0) return ratingDiff;
				return compareByCreated(first, second, 'desc');
			}

			if (selectedSort === 'oldest') {
				return compareByCreated(first, second, 'asc');
			}

			return compareByCreated(first, second, 'desc');
		});
	};

	const searchableBars = $derived.by(() => {
		const query = normalize(search.trim());
		const bars = data.bars as SerializedBarReview[];
		const filteredBars = !query
			? bars
			: bars.filter((bar) => {
					const haystack = [
						bar.title,
						bar.location,
						bar.description,
						bar.beerBrand,
						bar.author,
						...(bar.coAuthors ?? [])
					]
						.filter(Boolean)
						.join(' ')
						.toLowerCase();

					return haystack.includes(query);
				});

		return sortBars(filteredBars, sort);
	});

	const updateUrl = (nextSearch: string, nextSort: ReviewSort) => {
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

		const query = params.toString();
		const target = `${window.location.pathname}${query ? `?${query}` : ''}`;
		window.history.replaceState({}, '', target);
	};

	const handleSearch = (value: string) => {
		search = value;
		updateUrl(value, sort);
	};

	const handleSortChange = (event: Event) => {
		const nextSort = normalizeSort((event.currentTarget as HTMLSelectElement).value);
		sort = nextSort;
		updateUrl(search, nextSort);
	};
</script>

<svelte:head>
	<title>En Stor Stark Review</title>
	<meta name="description" content="En Stor Stark Review<" />
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

		<div
			class="mt-6 rounded-2xl border border-white/90 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl sm:p-5"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div class="min-w-0 flex-1">
					<SearchBar value={search} onSearch={handleSearch} />
				</div>
				<label class="flex shrink-0 flex-col gap-1 sm:w-48">
					<span class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
						Sortera
					</span>
					<select
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
		</div>
	</div>

	<div class="mx-auto mt-8 grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
		{#each searchableBars as bar}
			<a href={`/${encodeURIComponent(bar.slug)}`} class="block hover:no-underline">
				<Card
					title={bar.title}
					description={bar.description}
					rating={bar.rating}
					location={bar.location}
					beerBrand={bar.beerBrand}
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
</section>
