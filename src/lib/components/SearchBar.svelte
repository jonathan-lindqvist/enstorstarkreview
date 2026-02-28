<script lang="ts">
	import SearchIcon from '$lib/components/svgs/SearchIcon.svelte';
</script>

<form class="flex w-full flex-col gap-2 sm:flex-row sm:items-center" method="get">
	<input
		name="search"
		id="search"
		type="text"
		class="h-11 w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 text-sm text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)] sm:flex-1"
	/>
	<button
		type="submit"
		class="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-ember)] px-6 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5"
	>
		<SearchIcon />
		Sök
	</button>
</form>
