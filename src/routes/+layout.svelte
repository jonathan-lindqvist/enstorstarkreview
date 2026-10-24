<script lang="ts">
	import AnalyticsBanner from '$lib/components/AnalyticsBanner.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import Navbar from '../lib/components/Navbar.svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';

	interface Props {
		children?: import('svelte').Snippet;
		data: LayoutProps['data'];
	}

	let { children, data }: Props = $props();
	const mapPage = $derived(page.route.id === '/karta');
</script>

<svelte:head>
	<link
		rel="alternate"
		type="application/rss+xml"
		title="En Stor Stark Review | nya recensioner"
		href="/feed.xml"
	/>
</svelte:head>

<Seo />
<div class="site-shell" class:map-page={mapPage}>
	<Navbar />

	<main class="min-h-0 flex-1">
		{@render children?.()}
	</main>

	{#if !mapPage}
		<Footer />
	{/if}
</div>

<AnalyticsBanner consent={data.analyticsConsent} />

<style>
	.site-shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.map-page {
		height: 100dvh;
		overflow: hidden;
	}
</style>
