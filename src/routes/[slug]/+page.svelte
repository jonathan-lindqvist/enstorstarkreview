<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewDescription from '$lib/components/ReviewDescription.svelte';
	import BarAttributePills from '$lib/components/BarAttributePills.svelte';
	import Beer from '@lucide/svelte/icons/beer';
	import History from '@lucide/svelte/icons/history';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
	import { formatAuthors } from '$lib/utils/authors';
	import { getBeerPriceDisplay } from '$lib/utils/price';
	import { beerClPerKr, formatClPerKr, isValidBeerVolumeCl } from '$lib/utils/beer-value';
	import { OVERALL_RATING_MAX } from '$lib/utils/ratings';
	import { onMount, untrack } from 'svelte';
	import { watchUserLocation } from '$lib/client/user-location';
	import type { UserLocationState } from '$lib/types/review-location';
	import { distanceKm } from '$lib/utils/review-distance';
	import ReviewDistance from '$lib/components/ReviewDistance.svelte';
	import ReviewImage from '$lib/components/ReviewImage.svelte';

	// The edit tool stays quiet: icon-only, no border. Deleting lives on the edit page.
	const ICON_ACTION =
		'inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';

	let { data, form }: PageProps = $props();
	let userLocation = $state<UserLocationState>(
		untrack(() => ({ position: null, error: null, disabled: !data.locationEnabled }))
	);
	onMount(() => watchUserLocation((state) => (userLocation = state)));
	const distance = $derived(distanceKm(userLocation.position, data.coordinates));
	const isDraft = $derived(data.bar.publicationStatus === 'draft');
	const beerPriceDisplay = $derived(
		getBeerPriceDisplay(data.bar.beerPriceKr, data.bar.isHappyHourPrice)
	);
	const beerBrandDisplay = $derived(data.bar.beerBrand?.trim() || UNKNOWN_BEER_BRAND_LABEL);
	const beerValue = $derived(beerClPerKr(data.bar.beerVolumeCl, data.bar.beerPriceKr));
	const googleMapsUrl = $derived(
		`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.bar.location)}`
	);

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		if (Number.isNaN(d.getTime())) return 'Okänt datum';
		return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{data.bar.title}</title>
</svelte:head>

<section class="page-shell">
	<div class="flex items-center justify-between gap-3">
		<a
			href={resolve('/')}
			class="group -ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
		>
			<ArrowLeft
				class="size-4 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
				aria-hidden="true"
			/>
			Alla recensioner
		</a>
		{#if data.user}
			<a
				href={resolve('/[slug]/edit', { slug: encodeURIComponent(data.bar.slug) })}
				class={ICON_ACTION}
				aria-label="Redigera recension"
				title="Redigera recension"
			>
				<SquarePen class="size-5" aria-hidden="true" />
			</a>
		{/if}
	</div>

	{#if isDraft}
		<div
			class="mt-6 flex flex-col gap-4 rounded-3xl border border-amber-300 bg-amber-100 p-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
			role="status"
		>
			<div>
				<p class="font-semibold">Privat utkast</p>
				<p class="mt-1 text-sm leading-relaxed text-amber-900">
					Endast inloggade användare kan se recensionen. Publicering går inte att ångra.
				</p>
			</div>
			<form method="POST" action="?/publish">
				<button type="submit" class="btn btn-primary w-full sm:w-auto">
					Publicera recension
				</button>
			</form>
		</div>
	{/if}

	{#if form?.message}
		<div
			class="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</div>
	{/if}

	<article class="glass-panel mt-6 overflow-hidden">
		<div class="md:grid md:grid-cols-2">
			<div class="p-3">
				<ReviewImage
					class="w-full rounded-xl"
					image={data.bar.image}
					alt={data.bar.title}
					preview="detail-v1"
					loading="eager"
					fetchpriority="high"
					imageFocusX={data.bar.imageFocusX}
					imageFocusY={data.bar.imageFocusY}
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
					{#if isValidBeerVolumeCl(data.bar.beerVolumeCl)}
						<span class="mx-1.5 text-slate-400" aria-hidden="true">·</span>
						<span class="font-semibold tabular-nums text-slate-900">{data.bar.beerVolumeCl} cl</span
						>
					{/if}
					{#if beerPriceDisplay}
						<span class="mx-1.5 text-slate-400" aria-hidden="true">·</span>
						<span class="font-semibold tabular-nums text-slate-900">{beerPriceDisplay.text}</span>
					{/if}
				</p>
				{#if beerPriceDisplay?.note}
					<p class="mt-1 text-sm text-slate-500">{beerPriceDisplay.note}</p>
				{/if}
				{#if beerValue !== null}
					<p class="mt-2 text-base text-slate-700">
						<span class="font-semibold tabular-nums" data-testid="beer-value"
							>{formatClPerKr(beerValue)}</span
						>
					</p>
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

			<section class="max-w-prose space-y-2">
				<h2 class="text-base font-semibold text-slate-900">Recension</h2>
				<ReviewDescription description={data.bar.description} />
			</section>

			<section class="space-y-3">
				<h2 class="text-base font-semibold text-slate-900">Betygsfördelning</h2>
				<ul class="grid gap-x-10 gap-y-5 sm:grid-cols-2">
					{#each REVIEW_RATING_METRICS as field (field.key)}
						{@const value = data.bar[field.key]}
						<li>
							<div class="flex items-baseline justify-between gap-3">
								<div class="min-w-0">
									<p class="text-sm font-semibold text-slate-900">{field.label}</p>
									<p class="text-xs text-slate-500">{field.description}</p>
								</div>
								<p class="shrink-0 tabular-nums">
									<span class="text-lg font-semibold text-amber-700">{value}</span><span
										class="text-xs text-slate-500">/5</span
									>
								</p>
							</div>
							<!-- Five cells, like the app: one per point, filled up to the rating. -->
							<div class="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
								{#each { length: 5 }, index (index)}
									<span
										class="h-1.5 rounded-full {index < Math.round(value)
											? 'bg-amber-500'
											: 'bg-slate-200/80'}"
									></span>
								{/each}
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<div class="border-t border-slate-200/80 pt-3">
				<a
					href={resolve('/[slug]/history', { slug: encodeURIComponent(data.bar.slug) })}
					class="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-600"
				>
					<History class="size-4" aria-hidden="true" />
					Visa ändringslogg
				</a>
			</div>
		</div>
	</article>
</section>
