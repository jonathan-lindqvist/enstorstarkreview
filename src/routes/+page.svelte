<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let searchQuery = '';
</script>

<svelte:head>
	<title>En Stor Stark Review</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full">
		<input
			type="text"
			value={searchQuery}
			placeholder="Sök på en bar här!"
			class="mt-5 mb-5 p-3 rounded w-full"
		/>
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
