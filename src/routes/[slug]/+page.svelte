<script lang="ts">
	import type { PageProps } from './$types';
	import ArrowLongLeft from '$lib/components/svgs/ArrowLongLeft.svelte';
	import { formatAuthors } from '$lib/utils/authors';

	let { data }: PageProps = $props();

	const ratingFields = [
		{ key: 'atmosphere', label: 'Atmosfär' },
		{ key: 'service', label: 'Service' },
		{ key: 'selection', label: 'Utbud' },
		{ key: 'quality', label: 'Kvalitet' },
		{ key: 'price', label: 'Prisvärdhet' },
		{ key: 'cleanliness', label: 'Renlighet' },
		{ key: 'soundLevel', label: 'Ljudnivå' },
		{ key: 'barhopPotential', label: 'Barhoppotential' }
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
</script>

<section class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6 sm:px-6">
	<a
		href="/"
		class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
	>
		<ArrowLongLeft className="size-5" />
		<span>Tillbaka till recensioner</span>
	</a>

	<article
		class="mt-4 overflow-hidden rounded-3xl border border-white/90 bg-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
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
						<p class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Recension</p>
						<h1 class="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
							{data.bar.title}
						</h1>
						<p class="mt-1 text-sm uppercase tracking-[0.2em] text-slate-500">
							{data.bar.location}
						</p>
					</div>
					<div
						class="w-full rounded-2xl border border-white/90 bg-white/80 px-4 py-3 text-center sm:w-auto sm:min-w-40 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
					>
						<p class="text-xs uppercase tracking-[0.2em] text-slate-500">Helhetsbetyg</p>
						<p class="text-4xl font-bold text-slate-900 sm:text-5xl">
							{`${data.bar.rating}/3`}
						</p>
					</div>
				</div>

				<div class="space-y-1 text-sm text-slate-700">
					<div>
						<span class="text-slate-500">Författare:</span>
						<span class="ml-2 text-slate-900"
							>{formatAuthors(data.bar.author, data.bar.coAuthors)}</span
						>
					</div>
					<div class="text-xs text-slate-500">
						<span>Publicerad {formatDate(data.bar.createdAt)}</span>
						<span class="mx-2">•</span>
						<span>Uppdaterad {formatDate(data.bar.updatedAt)}</span>
					</div>
				</div>
			</header>

			<section class="space-y-2">
				<h2 class="text-base font-semibold text-slate-900">Recension</h2>
				<p class="whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:text-base">
					{data.bar.description}
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-base font-semibold text-slate-900">Betygsfördelning</h2>
				<ul class="space-y-3">
					{#each ratingFields as field (field.key)}
						<li
							class="rounded-xl border border-white/80 bg-white/65 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
						>
							<div class="mb-2 flex items-center justify-between text-sm">
								<span class="text-slate-700">{field.label}</span>
								<span class="font-semibold text-slate-900">{formatRating(data.bar[field.key])}</span
								>
							</div>
							<div class="h-2 w-full rounded-full bg-slate-200">
								<div
									class="h-2 rounded-full bg-slate-400"
									style={`width: ${getBarWidth(data.bar[field.key])}`}
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<div class="border-t border-white/60 pt-4">
				<a
					href={`/${encodeURIComponent(data.bar.slug)}/history`}
					class="mr-2 inline-flex items-center justify-center rounded-full border border-white/85 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					Visa ändringslogg
				</a>
				{#if data.user}
					<a
						href={`/${encodeURIComponent(data.bar.slug)}/edit`}
						class="inline-flex items-center justify-center rounded-full border border-white/85 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-white hover:text-slate-900"
					>
						Redigera recension
					</a>
				{/if}
			</div>
		</div>
	</article>
</section>
