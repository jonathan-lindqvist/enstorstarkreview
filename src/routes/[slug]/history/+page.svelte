<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import ArrowLongLeft from '$lib/components/svgs/ArrowLongLeft.svelte';
	import { capitalizeAuthorName } from '$lib/utils/authors';

	let { data }: PageProps = $props();

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		if (Number.isNaN(d.getTime())) return 'Okänt datum';
		return d.toLocaleString('sv-SE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Ändringslogg för {data.bar.title}</title>
</svelte:head>

<section class="page-shell">
	<a
		href={resolve('/[slug]', { slug: encodeURIComponent(data.bar.slug) })}
		class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
	>
		<ArrowLongLeft className="size-5" />
		<span>Tillbaka till recensionen</span>
	</a>

	<div class="mt-6">
		<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">
			Ändringslogg för {data.bar.title}
		</h1>
		<p class="mt-2 text-slate-600">Se vad som ändrats mellan uppdateringar av recensionen.</p>
	</div>

	{#if data.history.length === 0}
		<p class="mt-6 text-slate-700">
			Inga uppdateringar har registrerats ännu. Ändringar visas här när någon redigerar recensionen.
		</p>
	{:else}
		<ol class="mt-6 space-y-4">
			{#each data.history as entry (entry.id)}
				<li class="glass-panel p-5 sm:p-6">
					<h2 class="font-sans text-base font-semibold text-slate-900">
						Uppdaterad {formatDate(entry.updatedAt)}
						<span class="font-normal text-slate-600"
							>av {capitalizeAuthorName(entry.updatedBy)}</span
						>
					</h2>

					{#if entry.changes.length === 0}
						<p class="mt-3 text-sm text-slate-600">
							Ingen innehållsändring registrerad för den här uppdateringen.
						</p>
					{:else}
						<dl class="mt-4 divide-y divide-slate-200/80">
							{#each entry.changes as change, index (index)}
								<div class="py-3 first:pt-0 last:pb-0">
									<dt class="text-sm font-semibold text-slate-800">{change.label}</dt>
									<dd class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
										<div class="rounded-lg bg-slate-100 p-3">
											<p class="text-xs font-medium text-slate-600">Tidigare</p>
											<p class="mt-1 whitespace-pre-line text-slate-700">{change.before}</p>
										</div>
										<div class="rounded-lg bg-emerald-50 p-3">
											<p class="text-xs font-medium text-emerald-800">Ny</p>
											<p class="mt-1 whitespace-pre-line text-slate-800">{change.after}</p>
										</div>
									</dd>
								</div>
							{/each}
						</dl>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>
