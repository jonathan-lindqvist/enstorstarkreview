<script>
	import Card from '../components/card.svelte';
import SearchBar from './SearchBar.svelte';
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="En stor stark review" />
</svelte:head>

<section class="h-full">
	<SearchBar />
	<Card title="En stor stark" description="En stor stark är en öl som är stark och stor." rating={3} location="Göteborg" />
</section>

