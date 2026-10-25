<script lang="ts">
	import ReviewImage from '$lib/components/ReviewImage.svelte';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import BarAttributePills from '$lib/components/BarAttributePills.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
	import type { ReviewPublicationStatus } from '$lib/types/bar-review';
	import { getBeerPriceDisplay } from '$lib/utils/price';
	import ReviewDistance from '$lib/components/ReviewDistance.svelte';
	import RatingGlass from '$lib/components/RatingGlass.svelte';

	interface Props {
		title: string;
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
		imageLoading?: 'eager' | 'lazy';
		imagePriority?: 'high' | 'auto';
	}

	let {
		title,
		rating,
		image,
		imageFocusX = 50,
		imageFocusY = 50,
		location,
		beerBrand,
		beerPriceKr,
		isHappyHourPrice = false,
		attributes = [],
		publicationStatus,
		showPublicationStatus = false,
		distanceKm,
		imageLoading = 'lazy',
		imagePriority = 'auto'
	}: Props = $props();

	// The card shows only the street; the full address is on the review page and in the tooltip.
	const street = $derived(location.split(',')[0].trim() || location);
	const beerPriceDisplay = $derived(getBeerPriceDisplay(beerPriceKr, isHappyHourPrice));
	const beerBrandDisplay = $derived(beerBrand?.trim() || UNKNOWN_BEER_BRAND_LABEL);
</script>

<div class="group relative isolate aspect-square overflow-hidden rounded-2xl bg-slate-900">
	<ReviewImage
		{image}
		alt={title}
		{imageFocusX}
		{imageFocusY}
		loading={imageLoading}
		fetchpriority={imagePriority}
		class="absolute inset-0 h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
	/>
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
	<div class="absolute inset-x-0 bottom-0 isolate flex flex-col gap-2 p-4 text-on-photo">
		<!-- Shade only the information area, leaving the rest of the photo clear in both themes. -->
		<div
			class="pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10 bg-gradient-to-t from-black/90 via-black/50 via-80% to-transparent"
			aria-hidden="true"
		></div>
		<div>
			<div class="flex items-end justify-between gap-3">
				<h2
					class="line-clamp-2 min-w-0 break-words text-xl font-semibold leading-tight text-shadow-sm"
					{title}
				>
					{title}
				</h2>
				<RatingGlass {rating} class="size-10" />
			</div>
			<p class="mt-1 truncate text-sm text-on-photo/85" title={location}>{street}</p>
		</div>
		<div>
			<div class="flex items-baseline justify-between gap-3">
				<p class="min-w-0 truncate text-base font-semibold leading-tight" title={beerBrandDisplay}>
					{beerBrandDisplay}
				</p>
				{#if beerPriceDisplay}
					<p class="shrink-0 whitespace-nowrap text-base font-semibold leading-tight tabular-nums">
						{beerPriceDisplay.text}
					</p>
				{/if}
			</div>
			{#if beerPriceDisplay?.note}
				<p class="mt-1 text-xs leading-tight text-on-photo/85">{beerPriceDisplay.note}</p>
			{/if}
		</div>
		<BarAttributePills {attributes} variant="photo" maxVisible={2} />
	</div>
</div>
