<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const heading = $derived(
		page.status === 404 ? '419 Baren är inte recenserad' : `${page.status} Något gick fel`
	);
</script>

<svelte:head>
	<title>{heading}</title>
</svelte:head>

<div class="page-shell">
	<div class="glass-panel px-6 py-12 text-center sm:p-12">
		<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">{heading}</h1>
		<a href={resolve('/')} class="btn btn-primary mt-8"> Till startsidan </a>
	</div>
</div>
