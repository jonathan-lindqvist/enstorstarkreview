<script lang="ts">
	import type { PageProps } from './$types';
	import ArrowLongLeft from '$lib/components/svgs/ArrowLongLeft.svelte';

	let { data }: PageProps = $props();

	const ratingFields = [
		{ key: 'atmosphere', label: 'Atmosfär' },
		{ key: 'service', label: 'Service' },
		{ key: 'selection', label: 'Utbud' },
		{ key: 'quality', label: 'Kvalitet' },
		{ key: 'price', label: 'Prisvärdhet' },
		{ key: 'cleanliness', label: 'Renlighet' },
		{ key: 'soundLevel', label: 'Ljudnivå' }
	] as const;

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		if (Number.isNaN(d.getTime())) return 'Okänt datum';
		return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
	}

	function formatRating(rating: number): string {
		return `${rating}/5`;
	}

	function getBarWidth(value: number): string {
		return `${Math.max(0, Math.min(100, (value / 5) * 100))}%`;
	}

	function formatAuthors(author: string, coAuthors?: string): string {
		return coAuthors ? `${author}, ${coAuthors}` : author;
	}
</script>

<section class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 sm:px-6">
	<a
		href="/"
		class="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-ember)] transition-colors"
	>
		<ArrowLongLeft className="size-5" />
		<span>Tillbaka till recensioner</span>
	</a>

	<article
		class="mt-4 overflow-hidden rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 shadow-[0_35px_90px_-55px_rgba(0,0,0,0.6)]"
	>
		<img
			class="h-56 w-full object-cover sm:h-72"
			src={`/images/${data.bar.image}`}
			alt={data.bar.title}
		/>

		<div class="space-y-6 p-5 sm:p-8">
			<header class="space-y-3">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-moss)]">
							Recension
						</p>
						<h1 class="mt-2 text-3xl font-semibold text-[var(--color-char)] sm:text-4xl">
							{data.bar.title}
						</h1>
						<p class="mt-1 text-sm uppercase tracking-[0.2em] text-[var(--color-moss)]">
							{data.bar.location}
						</p>
					</div>
					<div
						class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-center sm:w-auto sm:min-w-40"
					>
						<p class="text-xs uppercase tracking-[0.2em] text-[var(--color-moss)]">Helhetsbetyg</p>
						<p class="text-4xl font-bold text-[var(--color-ember)] sm:text-5xl">
							{formatRating(data.bar.rating)}
						</p>
					</div>
				</div>

				<div class="space-y-1 text-sm text-[color:var(--color-char)]/80">
					<div>
						<span class="text-[color:var(--color-char)]/60">Författare:</span>
						<span class="ml-2 text-[var(--color-char)]"
							>{formatAuthors(data.bar.author, data.bar.coAuthors)}</span
						>
					</div>
					<div class="text-xs text-[color:var(--color-char)]/55">
						<span>Publicerad {formatDate(data.bar.createdAt)}</span>
						<span class="mx-2">•</span>
						<span>Uppdaterad {formatDate(data.bar.updatedAt)}</span>
					</div>
				</div>
			</header>

			<section class="space-y-2">
				<h2 class="text-base font-semibold text-[var(--color-char)]">Recension</h2>
				<p
					class="whitespace-pre-line text-sm leading-relaxed text-[color:var(--color-char)]/80 sm:text-base"
				>
					{data.bar.description}
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-base font-semibold text-[var(--color-char)]">Betygsfördelning</h2>
				<ul class="space-y-3">
					{#each ratingFields as field (field.key)}
						<li class="rounded-xl border border-[color:var(--color-char)]/12 bg-white/70 p-3">
							<div class="mb-2 flex items-center justify-between text-sm">
								<span class="text-[color:var(--color-char)]/80">{field.label}</span>
								<span class="font-semibold text-[var(--color-ember)]"
									>{formatRating(data.bar[field.key])}</span
								>
							</div>
							<div class="h-2 w-full rounded-full bg-[color:var(--color-char)]/12">
								<div
									class="h-2 rounded-full bg-[var(--color-ember)]"
									style={`width: ${getBarWidth(data.bar[field.key])}`}
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			{#if data.user}
				<div class="border-t border-[color:var(--color-char)]/12 pt-4">
					<a
						href={`/${encodeURIComponent(data.bar.slug)}/edit`}
						class="inline-flex items-center justify-center rounded-full border border-[color:var(--color-char)]/12 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-char)] transition hover:-translate-y-0.5 hover:text-[var(--color-ember)]"
					>
						Redigera recension
					</a>
				</div>
			{/if}
		</div>
	</article>
</section>
