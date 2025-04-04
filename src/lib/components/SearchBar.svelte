<script lang="ts">
	import SearchIcon from '$lib/components/svgs/SearchIcon.svelte';
</script>

<form class="flex w-fit items-center h-10 gap-2" method="get">
	<input
		name="search"
		id="search"
		type="text"
		class="bg-white h-full rounded px-2 focus:outline-none focus:ring-orange-600 focus:ring-2"
	/>
	<button
		type="submit"
		class="flex gap-1 bg-orange-600 px-4 rounded h-full items-center hover:cursor-pointer"
	>
		<SearchIcon />
		Sök
	</button>
</form>
