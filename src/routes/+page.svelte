<script>
	import Card from '$lib/components/Card.svelte';
	import SearchBar from './SearchBar.svelte';
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full">
	<SearchBar />
	<a href="en-stor-stark" class="hover:no-underline">
		<Card
			title="En stor stark"
			description="En stor stark är en öl som är stark och stor."
			rating={3}
			location="Göteborg"
		/>
	</a>
</section>
