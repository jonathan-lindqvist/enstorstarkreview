<script lang="ts">
	import AnalyticsBanner from '$lib/components/AnalyticsBanner.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import Navbar from '../lib/components/Navbar.svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';

	interface Props {
		children?: import('svelte').Snippet;
		data: LayoutProps['data'];
	}

	let { children, data }: Props = $props();
</script>

<svelte:head>
	<link
		rel="alternate"
		type="application/rss+xml"
		title="En Stor Stark Review – nya recensioner"
		href="/feed.xml"
	/>
</svelte:head>

<Seo />
<Navbar />

<main class="flex-1">
	{@render children?.()}
</main>

<Footer />

<AnalyticsBanner consent={data.analyticsConsent} />

<style>
	/* .app {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		padding: 0 24px;
	} */
</style>
