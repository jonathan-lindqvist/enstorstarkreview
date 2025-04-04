<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full bg-primary-gray px-6 py-6">
	<SearchBar />
	{#each data.bars as bar}
		<a href={bar.slug} class="hover:no-underline block mt-4" >
			<Card
				title={bar.title}
				description={bar.description}
				rating={bar.rating}
				location={bar.location}
				image={bar.image}
			/>
		</a>
	{/each}
</section>
