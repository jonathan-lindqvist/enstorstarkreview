<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	let { data } = $props();
	let search = $state('');

	$effect(() => {
		search = (data as { search?: string }).search ?? '';
	});

	const normalize = (value: string) => value.toLowerCase();

	const searchableBars = $derived.by(() => {
		const query = normalize(search.trim());
		if (!query) return data.bars;

		return data.bars.filter((bar) => {
			const haystack = [
				bar.title,
				bar.location,
				bar.description,
				bar.author,
				...(bar.coAuthors ?? [])
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			return haystack.includes(query);
		});
	});

	const handleSearch = (value: string) => {
		search = value;

		const params = new URLSearchParams(window.location.search);
		const trimmed = value.trim();

		if (trimmed) {
			params.set('search', trimmed);
		} else {
			params.delete('search');
		}

		const query = params.toString();
		const target = `${window.location.pathname}${query ? `?${query}` : ''}`;
		window.history.replaceState({}, '', target);
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
			<SearchBar value={search} onSearch={handleSearch} />
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
					image={bar.image}
					author={bar.author}
					coAuthors={bar.coAuthors}
				/>
			</a>
		{/each}
	</div>
</section>
