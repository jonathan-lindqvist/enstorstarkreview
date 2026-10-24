<script lang="ts">
	import { page } from '$app/state';
	import { getSeoMetadata, jsonLdScript, SITE_NAME, type SeoPageData } from '#lib/seo.js';
	const seo = $derived(
		getSeoMetadata(new URL(page.url.href), page.data as SeoPageData, page.status)
	);
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<link rel="canonical" href={seo.canonical} />
	<meta name="robots" content={seo.noindex ? 'noindex, follow' : 'index, follow'} />
	<meta property="og:locale" content="sv_SE" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={seo.title} />
	<meta property="og:description" content={seo.description} />
	<meta property="og:type" content={seo.type} />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:image" content={seo.image} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={seo.title} />
	<meta name="twitter:description" content={seo.description} />
	<meta name="twitter:image" content={seo.image} />
	{#each seo.structuredData as value, index (index)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON escapes HTML delimiters before insertion into an inert data block. -->
		{@html jsonLdScript(value)}
	{/each}
</svelte:head>
