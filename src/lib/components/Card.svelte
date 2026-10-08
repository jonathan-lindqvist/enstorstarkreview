<script lang="ts">
	import defaultImage from '$lib/images/image.png';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewDescription from '$lib/components/ReviewDescription.svelte';
	import BarAttributePills from '$lib/components/BarAttributePills.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
	import type { ReviewPublicationStatus } from '$lib/types/bar-review';
	import { formatAuthors } from '$lib/utils/authors';
	import { getBeerPriceDisplay } from '$lib/utils/price';

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
		author?: string;
		coAuthors?: string[] | string;
		publicationStatus?: ReviewPublicationStatus;
		showPublicationStatus?: boolean;
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
		author,
		coAuthors,
		publicationStatus,
		showPublicationStatus = false
	}: Props = $props();

	const resolvedImage = $derived.by(() => {
		if (!image) return defaultImage;
		if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('/')) {
			return image;
		}
		return `/images/${image}`;
	});

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
	class="group row-span-4 grid h-full grid-rows-subgrid gap-y-0 overflow-hidden rounded-3xl border border-white/90 bg-white/68 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_90%,transparent),0_14px_30px_-26px_color-mix(in_oklab,var(--color-glass-shadow)_55%,transparent)] backdrop-blur-xl transition duration-300 hover:bg-white/82"
>
	<div class="relative aspect-square overflow-hidden">
		<div
			class="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
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
		<div class="absolute inset-x-0 bottom-0 space-y-1 p-5 text-on-photo">
			<div class="flex items-end justify-between gap-4">
				<h2 class="min-w-0 text-xl font-semibold leading-snug text-shadow-sm">{title}</h2>
				<div
					class="inline-flex min-w-12 shrink-0 items-baseline justify-center whitespace-nowrap rounded-full border border-on-photo/25 bg-black/35 px-2.5 py-1 backdrop-blur-md"
				>
					<span class="text-lg font-semibold leading-none">{rating}</span>
					<span class="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-photo/70"
						>/3</span
					>
				</div>
			</div>
			<p class="text-[11px] uppercase tracking-[0.24em] text-on-photo/80">{location}</p>
			{#if author}
				<p class="text-xs text-on-photo/80">av {formatAuthors(author, coAuthors)}</p>
			{/if}
		</div>
	</div>
	<div class="px-5 pt-3">
		<div
			class="rounded-2xl border border-white/85 bg-white/76 px-3 py-2.5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_85%,transparent)]"
		>
			<div class="mt-1 flex items-start justify-between gap-3">
				<p class="min-w-0 text-base font-semibold leading-tight text-slate-900">
					{beerBrandDisplay}
				</p>
				{#if beerPriceDisplay}
					<p class="whitespace-nowrap text-base font-semibold leading-tight text-slate-900">
						{beerPriceDisplay.text}
					</p>
				{/if}
			</div>
			{#if beerPriceDisplay?.note}
				<p class="mt-1 text-[10px] leading-tight text-slate-500">{beerPriceDisplay.note}</p>
			{/if}
		</div>
	</div>
	<div class="px-5 [&:has(ul)]:pt-3"><BarAttributePills {attributes} /></div>
	<div class="px-5 pb-5 pt-3"><ReviewDescription {description} variant="preview" /></div>
</div>
