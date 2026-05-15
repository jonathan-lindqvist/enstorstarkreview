<script lang="ts">
	import AnalyticsBanner from '$lib/components/AnalyticsBanner.svelte';
	import Navbar from '../lib/components/Navbar.svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';

	interface Props {
		children?: import('svelte').Snippet;
		data: LayoutProps['data'];
	}

	let { children, data }: Props = $props();
</script>

<Navbar />

<main>
	{@render children?.()}
</main>

<AnalyticsBanner consent={data.analyticsConsent as 'unset' | 'granted' | 'denied'} />

<style>
	/* .app {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		padding: 0 24px;
	} */
</style>
