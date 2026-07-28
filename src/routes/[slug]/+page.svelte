<script lang="ts">
	import type { PageProps } from './$types';
	import ArrowLongLeft from '$lib/components/svgs/ArrowLongLeft.svelte';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewDescription from '$lib/components/ReviewDescription.svelte';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
	import { formatAuthors } from '$lib/utils/authors';
	import { getBeerPriceDisplay } from '$lib/utils/price';

	let { data, form }: PageProps = $props();
	const isDraft = $derived(data.bar.publicationStatus === 'draft');
	const beerPriceDisplay = $derived(
		getBeerPriceDisplay(data.bar.beerPriceKr, data.bar.isHappyHourPrice)
	);
	const googleMapsUrl = $derived(
		`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.bar.location)}`
	);

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

	{#if isDraft}
		<div
			class="mt-4 flex flex-col gap-4 rounded-3xl border border-amber-300/80 bg-amber-100/90 p-5 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between"
			role="status"
		>
			<div>
				<p class="text-sm font-bold uppercase tracking-[0.18em]">Privat utkast</p>
				<p class="mt-1 text-sm leading-relaxed">
					Endast inloggade användare kan se recensionen. Publicering går inte att ångra.
				</p>
			</div>
			<form method="POST" action="?/publish">
				<button
					type="submit"
					class="inline-flex w-full items-center justify-center rounded-full bg-amber-900 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-amber-950 sm:w-auto"
				>
					Publicera recension
				</button>
			</form>
		</div>
	{/if}

	{#if form?.message}
		<div class="mt-4 rounded-2xl border border-red-400/60 bg-red-100 p-4 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<article
		class="mt-4 overflow-hidden rounded-3xl border border-white/90 bg-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
	>
		<img
			class="h-56 w-full object-cover sm:h-72"
			src={`/images/${data.bar.image}`}
			alt={data.bar.title}
			style={`object-position: ${data.bar.imageFocusX ?? 50}% ${data.bar.imageFocusY ?? 50}%`}
		/>

		<div class="space-y-6 p-5 sm:p-8">
			<header class="space-y-3">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<div class="flex flex-wrap items-center gap-3">
							<p class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
								Recension
							</p>
							{#if data.user}
								<PublicationBadge status={data.bar.publicationStatus} />
							{/if}
						</div>
						<h1 class="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
							{data.bar.title}
						</h1>
						<a
							href={googleMapsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-1 inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-slate-700 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
						>
							<MapPin size={16} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
							<span>{data.bar.location}</span>
						</a>
					</div>
					<div class="grid w-full gap-3 sm:w-auto sm:min-w-44">
						<div
							class="rounded-2xl border border-white/90 bg-white/80 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
						>
							<p class="text-xs uppercase tracking-[0.2em] text-slate-500">Helhetsbetyg</p>
							<p class="text-4xl font-bold text-slate-900 sm:text-5xl">
								{`${data.bar.rating}/3`}
							</p>
						</div>
						{#if beerPriceDisplay}
							<div
								class="rounded-2xl border border-white/90 bg-white/80 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
							>
								<p class="text-xs uppercase tracking-[0.16em] text-slate-500">
									Pris för en stor stark
								</p>
								<p class="text-3xl font-bold leading-tight text-slate-900">
									{beerPriceDisplay.text}
								</p>
								{#if beerPriceDisplay.note}
									<p class="mt-1 text-xs text-slate-500">{beerPriceDisplay.note}</p>
								{/if}
							</div>
						{/if}
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
						<span>Skapad {formatDate(data.bar.createdAt)}</span>
						<span class="mx-2">•</span>
						<span>Uppdaterad {formatDate(data.bar.updatedAt)}</span>
					</div>
				</div>
			</header>

			<section class="space-y-2">
				<h2 class="text-base font-semibold text-slate-900">Recension</h2>
				<ReviewDescription description={data.bar.description} />
			</section>

			<section class="space-y-3">
				<h2 class="text-base font-semibold text-slate-900">Betygsfördelning</h2>
				<ul class="space-y-3">
					{#each REVIEW_RATING_METRICS as field (field.key)}
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
