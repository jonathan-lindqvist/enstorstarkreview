<script lang="ts">
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { formatAuthors } from '$lib/utils/authors';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Recensioner</title>
</svelte:head>

<div class="page-shell">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">Recensioner</h1>
			<p class="mt-2 text-slate-600">
				Inloggad som {data.username}. Hantera utkast och publicerade recensioner.
			</p>
		</div>
		<a href={resolve('/admin/reviews/create')} class="btn btn-primary">Skapa utkast</a>
	</div>

	{#if page.url.searchParams.has('borttagen')}
		<p
			role="status"
			class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
		>
			Recensionen togs bort.
		</p>
	{/if}

	<ul class="glass-panel mt-6 divide-y divide-slate-200/80 overflow-hidden">
		{#each data.bars as bar (bar._id)}
			<li class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div class="flex items-center gap-4">
					<a
						href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
						class="aspect-[16/9] w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100"
						aria-label={`Öppna ${bar.title}`}
					>
						<img
							src={bar.image ? `/images/${bar.image}` : undefined}
							alt=""
							class="h-full w-full object-cover"
							style={`object-position: ${bar.imageFocusX ?? 50}% ${bar.imageFocusY ?? 50}%`}
						/>
					</a>
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<a
								href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
								class="font-serif text-lg font-semibold text-slate-900 hover:text-slate-700"
							>
								{bar.title}
							</a>
							<PublicationBadge status={bar.publicationStatus} />
						</div>
						{#if bar.author}
							<p class="text-sm text-slate-600">
								av {formatAuthors(bar.author, bar.coAuthors)}
							</p>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<a
						href={resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })}
						class="btn btn-secondary"
					>
						Öppna
					</a>
					<a
						href={resolve('/[slug]/edit', { slug: encodeURIComponent(bar.slug) })}
						class="btn btn-secondary"
					>
						Redigera
					</a>
				</div>
			</li>
		{/each}
	</ul>
</div>
