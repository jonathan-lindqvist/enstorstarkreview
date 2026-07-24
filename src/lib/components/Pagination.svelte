<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';

	interface Props {
		page: number;
		pageCount: number;
		getPageHref: (page: number) => string;
	}

	type PageItem = number | 'ellipsis';

	let { page, pageCount, getPageHref }: Props = $props();

	const getPageItems = (currentPage: number, totalPages: number): PageItem[] => {
		if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

		const items: PageItem[] = [1];
		const firstMiddlePage = Math.max(2, currentPage - 1);
		const lastMiddlePage = Math.min(totalPages - 1, currentPage + 1);

		if (firstMiddlePage > 2) items.push('ellipsis');
		for (let current = firstMiddlePage; current <= lastMiddlePage; current += 1) {
			items.push(current);
		}
		if (lastMiddlePage < totalPages - 1) items.push('ellipsis');

		items.push(totalPages);
		return items;
	};

	const pageItems = $derived(getPageItems(page, pageCount));
	const previousPage = $derived(page - 1);
	const nextPage = $derived(page + 1);
</script>

{#if pageCount > 1}
	<nav
		aria-label="Sidnavigering"
		class="mx-auto mt-8 w-full max-w-6xl rounded-3xl border border-white/85 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-4 sm:py-3.5"
	>
		<p class="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
			Sida {page} av {pageCount}
		</p>

		<div class="grid grid-cols-2 gap-2 sm:hidden">
			{#if page > 1}
				<a
					href={getPageHref(previousPage)}
					class="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/90 bg-white/82 px-3 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					<ChevronLeft size={17} strokeWidth={2} aria-hidden="true" />
					Föregående
				</a>
			{:else}
				<span
					aria-disabled="true"
					class="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/65 bg-white/45 px-3 text-sm font-semibold text-slate-400"
				>
					<ChevronLeft size={17} strokeWidth={2} aria-hidden="true" />
					Föregående
				</span>
			{/if}

			{#if page < pageCount}
				<a
					href={getPageHref(nextPage)}
					class="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/90 bg-white/82 px-3 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					Nästa
					<ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
				</a>
			{:else}
				<span
					aria-disabled="true"
					class="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/65 bg-white/45 px-3 text-sm font-semibold text-slate-400"
				>
					Nästa
					<ChevronRight size={17} strokeWidth={2} aria-hidden="true" />
				</span>
			{/if}
		</div>

		<div class="hidden items-center justify-center gap-1.5 sm:flex">
			{#if page > 1}
				<a
					href={getPageHref(previousPage)}
					aria-label="Föregående sida"
					class="inline-flex size-10 items-center justify-center rounded-full border border-white/90 bg-white/82 text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					<ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
				</a>
			{:else}
				<span
					aria-label="Föregående sida"
					aria-disabled="true"
					class="inline-flex size-10 items-center justify-center rounded-full border border-white/65 bg-white/45 text-slate-400"
				>
					<ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
				</span>
			{/if}

			{#each pageItems as item, index (`${item}-${index}`)}
				{#if item === 'ellipsis'}
					<span
						class="inline-flex size-10 items-center justify-center text-slate-500"
						aria-hidden="true"
					>
						<MoreHorizontal size={20} strokeWidth={2} />
					</span>
				{:else if item === page}
					<span
						aria-current="page"
						class="inline-flex size-10 items-center justify-center rounded-full border border-white bg-white text-sm font-bold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
					>
						{item}
					</span>
				{:else}
					<a
						href={getPageHref(item)}
						aria-label={`Sida ${item}`}
						class="inline-flex size-10 items-center justify-center rounded-full border border-white/90 bg-white/72 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-900"
					>
						{item}
					</a>
				{/if}
			{/each}

			{#if page < pageCount}
				<a
					href={getPageHref(nextPage)}
					aria-label="Nästa sida"
					class="inline-flex size-10 items-center justify-center rounded-full border border-white/90 bg-white/82 text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					<ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
				</a>
			{:else}
				<span
					aria-label="Nästa sida"
					aria-disabled="true"
					class="inline-flex size-10 items-center justify-center rounded-full border border-white/65 bg-white/45 text-slate-400"
				>
					<ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
				</span>
			{/if}
		</div>
	</nav>
{/if}
