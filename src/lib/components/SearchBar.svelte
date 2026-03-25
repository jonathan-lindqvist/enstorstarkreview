<script lang="ts">
	import SearchIcon from '$lib/components/svgs/SearchIcon.svelte';
</script>

<form class="flex w-full flex-col gap-2 sm:flex-row sm:items-center" method="get">
	<input
		name="search"
		id="search"
		type="text"
		placeholder="Sök bar, stadsdel eller känsla"
		class="h-11 w-full rounded-2xl border border-white/95 bg-white/90 px-4 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none backdrop-blur-md focus:ring-2 focus:ring-sky-200 sm:flex-1"
	/>
	<button
		type="submit"
		class="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/95 bg-white/92 px-6 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 transition hover:bg-white"
	>
		<SearchIcon />
		Sök
	</button>
</form>
