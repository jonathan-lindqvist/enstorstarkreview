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

<div class="mx-auto w-full max-w-3xl px-4 pb-12 pt-6 sm:pt-12">
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-12"
	>
		<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">{heading}</h1>
		<a
			href={resolve('/')}
			class="mt-8 inline-flex min-h-12 items-center justify-center rounded-full border border-white/90 bg-white/85 px-6 py-3 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2"
		>
			Till startsidan
		</a>
	</div>
</div>
