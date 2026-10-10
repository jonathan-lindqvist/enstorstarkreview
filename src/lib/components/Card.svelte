<script lang="ts">
	import defaultImage from '$lib/images/image.png';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewDescription from '$lib/components/ReviewDescription.svelte';
	import BarAttributePills from '$lib/components/BarAttributePills.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
	import type { ReviewPublicationStatus } from '$lib/types/bar-review';
	import { getBeerPriceDisplay } from '$lib/utils/price';
	import ReviewDistance from '$lib/components/ReviewDistance.svelte';

	interface Props {
		title: string;
		description: string;
		rating: number;
		image?: string;
		imageFocusX?: number;
		imageFocusY?: number;
		location: string;
		beerBrand?: string;
		beerPriceKr?: number;
		isHappyHourPrice?: boolean;
		attributes?: BarAttributeKey[];
		publicationStatus?: ReviewPublicationStatus;
		showPublicationStatus?: boolean;
		distanceKm?: number | null;
	}

	let {
		title,
		description,
		rating,
		image = defaultImage,
		imageFocusX = 50,
		imageFocusY = 50,
		location,
		beerBrand,
		beerPriceKr,
		isHappyHourPrice = false,
		attributes = [],
		publicationStatus,
		showPublicationStatus = false,
		distanceKm
	}: Props = $props();

	const resolvedImage = $derived.by(() => {
		if (!image) return defaultImage;
		if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('/')) {
			return image;
		}
		return `/images/${image}`;
	});

	// The card shows only the street; the full address is on the review page and in the tooltip.
	const street = $derived(location.split(',')[0].trim() || location);
	const beerPriceDisplay = $derived(getBeerPriceDisplay(beerPriceKr, isHappyHourPrice));
	const beerBrandDisplay = $derived(beerBrand?.trim() || UNKNOWN_BEER_BRAND_LABEL);
</script>

<!--
	Four rows (photo, beer, attributes, description) that join the parent grid's subgrid when there
	is one, so the same row lines up across every card on the line. The name, rating, address and
	credit sit on the photo to keep the card short. Each row always renders, even when empty, to
	keep the row count fixed.
-->
<div
	class="glass-panel group row-span-4 grid h-full grid-rows-subgrid gap-y-0 overflow-hidden transition-colors duration-200 hover:bg-white/82"
>
	<div class="relative aspect-square overflow-hidden">
		<div
			class="h-full w-full bg-cover bg-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
			style={`background-image: url('${resolvedImage}'); background-position: ${imageFocusX ?? 50}% ${imageFocusY ?? 50}%`}
			role="img"
			aria-label={title}
		></div>
		<!-- A dark scrim in both themes: the text on it reads against any photo. -->
		<div
			class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
		></div>
		{#if showPublicationStatus}
			<div class="absolute left-3 top-3">
				<PublicationBadge status={publicationStatus} variant="photo" />
			</div>
		{/if}
		{#if distanceKm != null}
			<div class="absolute right-3 top-3">
				<ReviewDistance {distanceKm} variant="photo" />
			</div>
		{/if}
		<!--
			Anchored to the bottom. The street keeps to one line, so it and the last line of the name sit
			at the same height on every card; a two-line name grows upwards.
		-->
		<div class="absolute inset-x-0 bottom-0 flex flex-col p-5 text-on-photo">
			<div class="flex items-end justify-between gap-4">
				<h2 class="line-clamp-2 min-w-0 text-xl font-semibold leading-snug text-shadow-sm">
					{title}
				</h2>
				<div
					class="inline-flex min-w-12 shrink-0 items-baseline justify-center whitespace-nowrap rounded-full bg-black/40 px-2.5 py-1 tabular-nums backdrop-blur-md"
					role="img"
					aria-label={`Helhetsbetyg ${rating} av 3`}
				>
					<span class="text-lg font-semibold leading-none" aria-hidden="true">{rating}</span>
					<span class="ml-0.5 text-xs font-semibold text-on-photo/80" aria-hidden="true">/3</span>
				</div>
			</div>
			<p class="mt-1 truncate text-sm text-on-photo/85" title={location}>
				{street}
			</p>
		</div>
	</div>
	<div class="px-5 pt-4">
		<div class="flex items-baseline justify-between gap-3">
			<p class="min-w-0 text-base font-semibold leading-tight text-slate-900">
				{beerBrandDisplay}
			</p>
			{#if beerPriceDisplay}
				<p
					class="whitespace-nowrap text-base font-semibold leading-tight tabular-nums text-slate-900"
				>
					{beerPriceDisplay.text}
				</p>
			{/if}
		</div>
		{#if beerPriceDisplay?.note}
			<p class="mt-1 text-xs leading-tight text-slate-500">{beerPriceDisplay.note}</p>
		{/if}
	</div>
	<div class="px-5 [&:has(ul)]:pt-3"><BarAttributePills {attributes} /></div>
	<div class="px-5 pb-5 pt-3"><ReviewDescription {description} variant="preview" /></div>
</div>
