<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let searchQuery = '';

	const onSearch = (event: Event) => {
		event.preventDefault();
		const query = new URLSearchParams({ query: searchQuery }).toString();
		window.location.href = `?${query}`;
	};

	const resetSearch = (event: Event) => {
		event.preventDefault();
		searchQuery = '';
		const query = new URLSearchParams({ query: searchQuery }).toString();
		window.location.href = `?${query}`;
	};
</script>

<svelte:head>
	<title>En Stor Stark Review</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full">
	<form on:submit={onSearch} class="flex items-center w-full mt-5 mb-5">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Sök på en bar här!"
			class="flex-1 p-3 rounded text-black"
		/>

		<button type="submit" class="bg-blue-500 p-3 rounded ml-2">Sök</button>
	</form>

	{#if searchQuery.length > 0}
		<form on:submit={resetSearch} class="w-full mb-5">
			<button type="submit" class="rounded w-25">Reset sökning</button>
		</form>
	{/if}

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
