<script lang="ts">
	import Lock from '@lucide/svelte/icons/lock';
	import ReviewImage from '$lib/components/ReviewImage.svelte';
	import BarAttributePills from '$lib/components/BarAttributePills.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
	import type { ReviewPublicationStatus } from '$lib/types/bar-review';
	import { isValidBeerPriceKr } from '$lib/utils/price';
	import { formatAuthorCredit, getAuthorAvatarIndex } from '$lib/utils/authors';
	import { getReviewExcerpt } from '$lib/utils/review-excerpt';
	import ReviewDistance from '$lib/components/ReviewDistance.svelte';
	import RatingGlass from '$lib/components/RatingGlass.svelte';

	interface Props {
		title: string;
		rating: number;
		image?: string;
		imageFocusX?: number;
		imageFocusY?: number;
		location: string;
		description?: string;
		authors?: string[];
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
		description = '',
		authors = [],
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

	// Full class names, so Tailwind generates every avatar colour.
	const AVATAR_COLORS = [
		'bg-avatar-0',
		'bg-avatar-1',
		'bg-avatar-2',
		'bg-avatar-3',
		'bg-avatar-4',
		'bg-avatar-5',
		'bg-avatar-6',
		'bg-avatar-7',
		'bg-avatar-8',
		'bg-avatar-9',
		'bg-avatar-10',
		'bg-avatar-11'
	];
	const MAX_AVATARS = 4;

	// The card shows only the street; the full address is on the review page and in the tooltip.
	const street = $derived(location.split(',')[0].trim() || location);
	const excerpt = $derived(getReviewExcerpt(description));
	const credit = $derived(formatAuthorCredit(authors));
	const isDraftShown = $derived(showPublicationStatus && publicationStatus === 'draft');
	const beerBrandDisplay = $derived(beerBrand?.trim() || UNKNOWN_BEER_BRAND_LABEL);
</script>

<div class="group relative isolate aspect-square overflow-hidden rounded-3xl bg-slate-900">
	<ReviewImage
		{image}
		alt={title}
		{imageFocusX}
		{imageFocusY}
		loading={imageLoading}
		fetchpriority={imagePriority}
		class={`absolute inset-0 h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${publicationStatus === 'draft' ? 'grayscale' : ''}`}
	/>
	<!-- Shade the lower photo behind the information, as the apps do, leaving the top clear. -->
	<div
		class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-35% via-black/55 via-65% to-black/85"
		aria-hidden="true"
	></div>
	{#if isDraftShown}
		<span
			data-publication-status="draft"
			class="absolute left-4 top-4 inline-flex h-6.5 items-center gap-1.5 rounded-full bg-amber-400 px-2.5 text-xs font-extrabold uppercase tracking-wider text-black"
		>
			<Lock size={11} strokeWidth={3} aria-hidden="true" />
			Utkast
		</span>
	{/if}
	<div class="absolute right-3.5 top-3.5 flex flex-col items-end gap-2">
		<RatingGlass {rating} class="pointer-events-none size-13" />
		{#if distanceKm != null}
			<ReviewDistance {distanceKm} variant="photo" />
		{/if}
	</div>
	<div class="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4.5 text-on-photo">
		<!-- Optional content sits above the title or keeps a fixed height, so cards line up. -->
		<BarAttributePills {attributes} variant="photo" maxVisible={2} class="justify-end" />
		<h2
			class="line-clamp-2 text-balance break-words text-3xl font-extrabold leading-[1.1] tracking-tight text-shadow-sm"
			{title}
		>
			{title}
		</h2>
		<p class="line-clamp-2 min-h-10 text-sm leading-5 text-on-photo/75">{excerpt}</p>
		{#if authors.length}
			<div class="flex min-w-0 items-center gap-2">
				<span class="flex shrink-0 -space-x-2" aria-hidden="true">
					{#each authors.slice(0, MAX_AVATARS) as name (name)}
						<span
							class={`grid size-6 place-items-center rounded-full border-[1.5px] border-black/55 text-[0.6875rem] font-bold text-black ${AVATAR_COLORS[getAuthorAvatarIndex(name)]}`}
						>
							{name.charAt(0).toUpperCase()}
						</span>
					{/each}
					{#if authors.length > MAX_AVATARS}
						<span
							class="grid size-6 place-items-center rounded-full bg-black/60 text-[0.625rem] font-bold"
						>
							+{authors.length - MAX_AVATARS}
						</span>
					{/if}
				</span>
				<p class="min-w-0 truncate text-[0.8125rem] font-semibold" title={`av ${credit}`}>
					<span class="text-on-photo/75">av</span>
					{credit}
				</p>
			</div>
		{/if}
		<div class="flex items-end justify-between gap-3">
			<div class="min-w-0 text-xs leading-4">
				<p class="truncate font-semibold" title={beerBrandDisplay}>{beerBrandDisplay}</p>
				<p class="mt-0.5 truncate text-on-photo/75" title={location}>{street}</p>
			</div>
			{#if isValidBeerPriceKr(beerPriceKr)}
				<p
					class="flex shrink-0 items-baseline gap-0.5 font-serif font-extrabold leading-none text-amber-400 tabular-nums"
					title={isHappyHourPrice ? 'Happy hour-pris' : undefined}
				>
					<span class="text-[2.5rem] tracking-tight">{beerPriceKr}</span>
					<span class="text-base">{isHappyHourPrice ? 'kr*' : 'kr'}</span>
					{#if isHappyHourPrice}
						<span class="sr-only">, happy hour-pris</span>
					{/if}
				</p>
			{:else}
				<p class="shrink-0 font-serif text-[2.5rem] font-extrabold leading-none text-on-photo/40">
					<span aria-hidden="true">–</span>
					<span class="sr-only">Pris saknas</span>
				</p>
			{/if}
		</div>
	</div>
</div>
