<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type { PageData } from './$types';
	import SearchBar from './SearchBar.svelte';

	export let data: PageData;
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full">
	<SearchBar />
	{#each data.bars as bar}
		<a href={bar.slug} class="hover:no-underline">
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
