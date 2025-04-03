<script lang="ts">
	import Header from './Header.svelte';
	import '../app.css';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<Header />

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
