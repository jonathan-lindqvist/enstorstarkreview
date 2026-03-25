<script lang="ts">
	import type { PageData } from './$types';
	import defaultImage from '$lib/images/image.png';

	let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto w-full max-w-5xl px-4 pb-12 pt-6">
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
			Adminpanel
		</p>
		<h1 class="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
			Välkommen, {data.username}
		</h1>
		<p class="mt-2 text-sm text-slate-600">
			Granska och finjustera de senaste inläggen.
		</p>
		<a
			href="/admin/reviews/create"
			class="mt-6 inline-flex rounded-full border border-white/85 bg-white/82 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white"
		>
			Skapa recension
		</a>
	</div>

	<ul class="mt-8 space-y-4">
		{#each data.bars as bar}
			<li
				class="flex flex-col gap-4 rounded-3xl border border-white/90 bg-white/68 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-6"
			>
				<div class="flex items-center gap-4">
					<div
						class="h-16 w-16 overflow-hidden rounded-2xl border border-white/85"
					>
						<img
							src={bar.image ? `/images/${bar.image}` : undefined}
							alt={bar.title}
							class="h-full w-full object-cover"
						/>
					</div>
					<div>
						<h2 class="text-lg font-semibold text-slate-900">{bar.title}</h2>
						{#if bar.author}
							<p class="text-sm text-slate-600">
								av {bar.author}{bar.coAuthors ? ` & ${bar.coAuthors}` : ''}
							</p>
						{/if}
					</div>
				</div>
				<a
					href={`/admin/reviews/edit/${encodeURIComponent(bar.slug)}`}
					class="inline-flex rounded-full border border-white/85 bg-white/75 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					Redigera
				</a>
			</li>
		{/each}
	</ul>
</div>
