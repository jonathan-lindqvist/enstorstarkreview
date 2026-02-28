<script lang="ts">
	import type { PageData } from './$types';
	import defaultImage from '$lib/images/image.png';

	let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto w-full max-w-5xl px-4 pb-12 pt-6">
	<div
		class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 p-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.6)] sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-moss)]">
			Adminpanel
		</p>
		<h1 class="mt-4 text-3xl font-semibold text-[var(--color-char)] sm:text-4xl">
			Välkommen, {data.username}
		</h1>
		<p class="mt-2 text-sm text-[color:var(--color-char)]/70">
			Granska och finjustera de senaste inläggen.
		</p>
		<a
			href="/admin/reviews/create"
			class="mt-6 inline-flex rounded-full bg-[var(--color-ember)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5"
		>
			Skapa recension
		</a>
	</div>

	<ul class="mt-8 space-y-4">
		{#each data.bars as bar}
			<li
				class="flex flex-col gap-4 rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
			>
				<div class="flex items-center gap-4">
					<div
						class="h-16 w-16 overflow-hidden rounded-2xl border border-[color:var(--color-char)]/12"
					>
						<img
							src={bar.image ? `/images/${bar.image}` : undefined}
							alt={bar.title}
							class="h-full w-full object-cover"
						/>
					</div>
					<div>
						<h2 class="text-lg font-semibold text-[var(--color-char)]">{bar.title}</h2>
						{#if bar.author}
							<p class="text-sm text-[color:var(--color-char)]/70">
								av {bar.author}{bar.coAuthors ? ` & ${bar.coAuthors}` : ''}
							</p>
						{/if}
					</div>
				</div>
				<a
					href={`/admin/reviews/edit/${encodeURIComponent(bar.slug)}`}
					class="inline-flex rounded-full border border-[color:var(--color-char)]/12 bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-char)] transition hover:-translate-y-0.5 hover:text-[var(--color-ember)]"
				>
					Redigera
				</a>
			</li>
		{/each}
	</ul>
</div>
