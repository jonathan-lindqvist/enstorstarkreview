<script lang="ts">
	import Navbar from '../lib/components/Navbar.svelte';
	import '../app.css';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<Navbar />

<main>
	{@render children?.()}
</main>

<style>
	/* .app {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		padding: 0 24px;
	} */
</style>
