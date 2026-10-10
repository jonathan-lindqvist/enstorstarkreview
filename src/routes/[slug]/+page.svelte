<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
	import ArrowLongLeft from '$lib/components/svgs/ArrowLongLeft.svelte';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewDescription from '$lib/components/ReviewDescription.svelte';
	import BarAttributePills from '$lib/components/BarAttributePills.svelte';
	import Beer from '@lucide/svelte/icons/beer';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
	import { formatAuthors } from '$lib/utils/authors';
	import { getBeerPriceDisplay } from '$lib/utils/price';
	import { OVERALL_RATING_MAX } from '$lib/utils/ratings';
	import { onMount } from 'svelte';
	import { watchUserLocation } from '$lib/client/user-location';
	import type { UserLocationState } from '$lib/types/review-location';
	import { distanceKm } from '$lib/utils/review-distance';
	import ReviewDistance from '$lib/components/ReviewDistance.svelte';

	let { data, form }: PageProps = $props();
	let userLocation = $state<UserLocationState>({ position: null, error: null });
	onMount(() => watchUserLocation((state) => (userLocation = state)));
	const distance = $derived(distanceKm(userLocation.position, data.coordinates));
	const isDraft = $derived(data.bar.publicationStatus === 'draft');
	const beerPriceDisplay = $derived(
		getBeerPriceDisplay(data.bar.beerPriceKr, data.bar.isHappyHourPrice)
	);
	const beerBrandDisplay = $derived(data.bar.beerBrand?.trim() || UNKNOWN_BEER_BRAND_LABEL);
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

<section class="page-shell">
	<a
		href={resolve('/')}
		class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900"
	>
		<ArrowLongLeft className="size-5" />
		<span>Tillbaka till recensioner</span>
	</a>

	{#if isDraft}
		<div
			class="mt-6 flex flex-col gap-4 rounded-3xl border border-amber-300/80 bg-amber-100/90 p-5 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between"
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
		<div class="mt-6 rounded-2xl border border-red-400/60 bg-red-100 p-4 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<article
		class="mt-6 overflow-hidden rounded-3xl border border-white/90 bg-white/68 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_90%,transparent),0_14px_30px_-26px_color-mix(in_oklab,var(--color-glass-shadow)_55%,transparent)] backdrop-blur-xl"
	>
		<div class="md:grid md:grid-cols-2">
			<div class="p-3">
				<img
					class="aspect-square w-full rounded-xl object-cover"
					src={`/images/${data.bar.image}`}
					alt={data.bar.title}
					style={`object-position: ${data.bar.imageFocusX ?? 50}% ${data.bar.imageFocusY ?? 50}%`}
				/>
			</div>

			<header class="flex flex-col p-6 pb-0 sm:p-8 sm:pb-0 md:justify-center md:p-8 lg:p-10">
				<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl lg:text-5xl">
					{data.bar.title}
				</h1>
				<a
					href={googleMapsUrl}
					target="_blank"
					rel="external noopener noreferrer"
					class="mt-3 inline-flex items-start gap-1.5 self-start text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
				>
					<MapPin size={18} strokeWidth={1.75} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>{data.bar.location}</span>
				</a>
				<div class="mt-2"><ReviewDistance distanceKm={distance} /></div>
				{#if userLocation.error}
					<p class="mt-2 text-sm text-slate-500">{userLocation.error}</p>
				{/if}

				<div class="mt-8 flex items-center gap-4">
					<p class="flex gap-1" role="img" aria-label={`Helhetsbetyg ${data.bar.rating} av 3`}>
						{#each { length: OVERALL_RATING_MAX }, index (index)}
							<Beer
								size={32}
								strokeWidth={1.75}
								class={index < data.bar.rating ? 'text-amber-600' : 'text-slate-300'}
								aria-hidden="true"
							/>
						{/each}
					</p>
					<p class="text-sm text-slate-600" aria-hidden="true">
						<span class="font-semibold tabular-nums text-slate-900">{data.bar.rating} av 3</span>
					</p>
				</div>

				<p class="mt-4 text-lg text-slate-700">
					<span class="font-semibold text-slate-900">{beerBrandDisplay}</span>
					{#if beerPriceDisplay}
						<span class="mx-1.5 text-slate-400" aria-hidden="true">·</span>
						<span class="font-semibold tabular-nums text-slate-900">{beerPriceDisplay.text}</span>
					{/if}
				</p>
				{#if beerPriceDisplay?.note}
					<p class="mt-1 text-sm text-slate-500">{beerPriceDisplay.note}</p>
				{/if}

				<div
					class="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200/80 pt-5 text-sm text-slate-600"
				>
					<span
						>Av <span class="text-slate-900"
							>{formatAuthors(data.bar.author, data.bar.coAuthors)}</span
						></span
					>
					<span class="text-slate-400" aria-hidden="true">·</span>
					<span>Skapad {formatDate(data.bar.createdAt)}</span>
					{#if data.user}
						<PublicationBadge status={data.bar.publicationStatus} />
					{/if}
				</div>
				<p class="mt-1 text-xs text-slate-500">Uppdaterad {formatDate(data.bar.updatedAt)}</p>
			</header>
		</div>

		<div class="space-y-6 p-6 sm:p-8">
			<BarAttributePills attributes={data.bar.attributes} />

			<section class="space-y-2">
				<h2 class="text-base font-semibold text-slate-900">Recension</h2>
				<ReviewDescription description={data.bar.description} />
			</section>

			<section class="space-y-3">
				<h2 class="text-base font-semibold text-slate-900">Betygsfördelning</h2>
				<ul class="grid gap-x-10 gap-y-4 sm:grid-cols-2">
					{#each REVIEW_RATING_METRICS as field (field.key)}
						<li>
							<div class="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
								<span class="text-slate-700">{field.label}</span>
								<span class="font-semibold tabular-nums text-slate-900"
									>{formatRating(data.bar[field.key])}</span
								>
							</div>
							<div class="h-1.5 w-full rounded-full bg-slate-200/80">
								<div
									class="h-1.5 rounded-full bg-amber-500"
									style={`width: ${getBarWidth(data.bar[field.key])}`}
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<div class="border-t border-white/60 pt-4">
				<a
					href={resolve('/[slug]/history', { slug: encodeURIComponent(data.bar.slug) })}
					class="mr-2 inline-flex items-center justify-center rounded-full border border-white/85 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-white hover:text-slate-900"
				>
					Visa ändringslogg
				</a>
				{#if data.user}
					<a
						href={resolve('/[slug]/edit', { slug: encodeURIComponent(data.bar.slug) })}
						class="inline-flex items-center justify-center rounded-full border border-white/85 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-white hover:text-slate-900"
					>
						Redigera recension
					</a>
				{/if}
			</div>
		</div>
	</article>
</section>
