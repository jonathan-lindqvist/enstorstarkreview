<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full px-6 py-6">
	<SearchBar />

	<div
		class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch mt-6"
	>
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
