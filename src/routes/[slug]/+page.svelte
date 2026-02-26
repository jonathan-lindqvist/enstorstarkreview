<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<div class="mx-auto mt-6 w-full max-w-4xl px-4 pb-12">
	<div
		class="overflow-hidden rounded-3xl border border-black/10 bg-white/80 shadow-[0_35px_90px_-55px_rgba(0,0,0,0.6)]"
	>
		{#if data.bar.image}
			<img
				src={`/images/${data.bar.image}`}
				alt={data.bar.title}
				class="h-56 w-full object-cover sm:h-72"
			/>
		{/if}
		<div class="px-6 py-6 sm:px-10 sm:py-8">
			<p class="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-moss)]">
				Review
			</p>
			<h1 class="mt-4 text-3xl font-semibold text-[var(--color-char)] sm:text-4xl">
				{data.bar.title}
			</h1>

			<div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-char)]/70">
				{#if data.bar.author}
					<span>
						Reviewed by <span class="text-[var(--color-ember)]">{data.bar.author}</span>
					</span>
					{#if data.bar.coAuthors}
						<span> & {data.bar.coAuthors}</span>
					{/if}
				{/if}
				{#if data.bar.createdAt}
					<span class="mx-1">•</span>
					<span>{formatDate(data.bar.createdAt)}</span>
				{/if}
			</div>

			<div class="mt-6 flex flex-wrap items-center gap-3">
				<span
					class="rounded-full bg-[var(--color-ember)] px-3 py-1 text-sm font-semibold text-white"
				>
					{data.bar.rating}/5 stars
				</span>
				{#if data.bar.location}
					<span class="text-xs uppercase tracking-[0.3em] text-[var(--color-moss)]">
						{data.bar.location}
					</span>
				{/if}
			</div>

			<p class="mt-6 text-base leading-relaxed text-[color:var(--color-char)]/85">
				{data.bar.description}
			</p>

			<div class="mt-8 flex items-center justify-between">
				<a href="/" class="flex items-center gap-2 text-sm font-semibold text-[var(--color-ember)]">
					<svg
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
						/>
					</svg>
					Back to all reviews
				</a>

				{#if data.user}
					<a
						href={`/${encodeURIComponent(data.bar.slug)}/edit`}
						class="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-char)] transition hover:-translate-y-0.5 hover:text-[var(--color-ember)]"
					>
						Edit review
					</a>
				{/if}
			</div>
		</div>
	</div>
</div>
