<script lang="ts">
	import type { PageProps } from './$types';
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

<section class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 sm:px-6">
	<a
		href={`/${encodeURIComponent(data.bar.slug)}`}
		class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
	>
		<ArrowLongLeft className="size-5" />
		<span>Tillbaka till recensionen</span>
	</a>

	<div
		class="mt-4 rounded-3xl border border-white/90 bg-white/68 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Ändringslogg</p>
		<h1 class="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">{data.bar.title}</h1>
		<p class="mt-2 text-sm text-slate-600">
			Se vad som ändrats mellan uppdateringar av recensionen.
		</p>
	</div>

	{#if data.history.length === 0}
		<div
			class="mt-6 rounded-2xl border border-white/90 bg-white/68 p-5 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
		>
			Inga uppdateringar har registrerats ännu.
		</div>
	{:else}
		<ul class="mt-6 space-y-4">
			{#each data.history as entry}
				<li
					class="rounded-2xl border border-white/90 bg-white/68 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-5"
				>
					<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
						<span class="font-semibold uppercase tracking-[0.2em]">Uppdaterad</span>
						<span>{formatDate(entry.updatedAt)}</span>
						<span class="hidden sm:inline">•</span>
						<span>av {capitalizeAuthorName(entry.updatedBy)}</span>
					</div>

					{#if entry.changes.length === 0}
						<p class="text-sm text-slate-600">
							Ingen innehållsändring registrerad för den här uppdateringen.
						</p>
					{:else}
						<ul class="space-y-3">
							{#each entry.changes as change}
								<li class="rounded-xl border border-white/80 bg-white/70 p-3">
									<p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
										{change.label}
									</p>
									<div class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
										<div class="rounded-lg bg-slate-100/85 p-2">
											<p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
												Tidigare
											</p>
											<p class="mt-1 whitespace-pre-line text-slate-700">{change.before}</p>
										</div>
										<div class="rounded-lg bg-emerald-100/70 p-2">
											<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
												Ny
											</p>
											<p class="mt-1 whitespace-pre-line text-slate-800">{change.after}</p>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
