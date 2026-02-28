<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>En stor stark review</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="px-4 pb-12 pt-6 sm:px-8">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
		<div
			class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 p-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.6)] sm:p-10"
		>
			<p class="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-moss)]">
				En stor stark review
			</p>
			<h1 class="mt-4 text-3xl font-semibold text-[var(--color-char)] sm:text-4xl">
				Hitta de bästa barerna för en riktigt bra stor stark.
			</h1>
			<p
				class="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--color-char)]/75 sm:text-base"
			>
				Genomtänkta recensioner, härlig atmosfär och ärliga betyg från människor som älskar en
				perfekt stor stark.
			</p>
		</div>

		<div class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 p-4 sm:p-6">
			<SearchBar />
		</div>
	</div>

	<div class="mx-auto mt-8 grid w-full max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.bars as bar}
			<a href={`/${encodeURIComponent(bar.slug)}`} class="hover:no-underline block">
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
