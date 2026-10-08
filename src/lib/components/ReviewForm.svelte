<script lang="ts">
	import { validateImageFile, clampImageFocus } from '$lib/utils/review-image';
	import BeerBrandFields from './review-form/BeerBrandFields.svelte';
	import BeerPriceFields from './review-form/BeerPriceFields.svelte';
	import AuthorSelection from './review-form/AuthorSelection.svelte';
	import AttributeSelection from './review-form/AttributeSelection.svelte';
	import { normalizeBarAttributes } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import ImagePicker from './review-form/ImagePicker.svelte';
	import RatingFields from './review-form/RatingFields.svelte';
	import PriceComparisonChart from './PriceComparisonChart.svelte';

	import { tick } from 'svelte';
	import { OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
	import { descriptionTemplate } from '$lib/constants';
	import { REVIEW_RATING_METRICS, createReviewRatingValues } from '$lib/review-metadata';
	import { generateSlug } from '$lib/utils/slug';
	import { getReviewAuthorOptions } from '$lib/utils/authors';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';
	import type {
		SerializedBarReview,
		BarReviewFormData,
		ReviewRatingKey
	} from '$lib/types/bar-review';

	interface Props {
		mode: 'create' | 'edit';
		bar?: SerializedBarReview | null;
		fieldError?: string;
		fieldMessage?: string;
		previousFormData?: BarReviewFormData | null;
		availableUsers?: Array<{ username: string; _id: string }>;
		currentUsername?: string;
		priceComparison?: PriceComparisonPoint[];
	}

	let {
		mode,
		bar = null,
		fieldError = '',
		fieldMessage = '',
		previousFormData = null,
		availableUsers = [],
		currentUsername = '',
		priceComparison = []
	}: Props = $props();

	const existingCredit = $derived(mode === 'edit' ? bar : null);
	const selectableAuthors = $derived(
		getReviewAuthorOptions(
			currentUsername,
			availableUsers.map((user) => user.username),
			existingCredit
		)
	);

	const initialBarName = $derived(previousFormData?.barName ?? bar?.title ?? '');
	const initialDescription = $derived(previousFormData?.description ?? bar?.description ?? '');
	const initialAddress = $derived(previousFormData?.address ?? bar?.location ?? '');
	const initialSlug = $derived(previousFormData?.slug ?? bar?.slug ?? '');
	const initialBeerBrandSelection = $derived.by(() => {
		if (previousFormData) return previousFormData.beerBrandSelection;
		const beerBrand = bar?.beerBrand?.trim() ?? '';
		if (!beerBrand) return '';
		return isListedBeerBrand(beerBrand) ? beerBrand : OTHER_BEER_BRAND_VALUE;
	});
	const initialCustomBeerBrand = $derived.by(() => {
		if (previousFormData) return previousFormData.customBeerBrand;
		const beerBrand = bar?.beerBrand?.trim() ?? '';
		return beerBrand && !isListedBeerBrand(beerBrand) ? beerBrand : '';
	});
	const initialBeerPriceKr = $derived.by(() => {
		const value = previousFormData?.beerPriceKr ?? bar?.beerPriceKr;
		return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
	});
	const initialIsHappyHourPrice = $derived(
		previousFormData?.isHappyHourPrice ?? bar?.isHappyHourPrice ?? false
	);
	const initialRating = $derived(previousFormData?.rating ?? bar?.rating ?? 0);
	const initialAttributes = $derived(
		normalizeBarAttributes(previousFormData?.attributes ?? bar?.attributes)
	);
	const initialImageFocusX = $derived(previousFormData?.imageFocusX ?? bar?.imageFocusX ?? 50);
	const initialImageFocusY = $derived(previousFormData?.imageFocusY ?? bar?.imageFocusY ?? 50);

	const initialAuthors = $derived(
		previousFormData?.authors ?? getReviewAuthorOptions(currentUsername, [], existingCredit)
	);

	let barName = $state('');
	let description = $state('');
	let address = $state('');
	let slug = $state('');
	let beerBrandSelection = $state('');
	let customBeerBrand = $state('');
	let beerPriceKr = $state<string | number | undefined>('');
	let isHappyHourPrice = $state(false);
	let authors = $state<string[]>([]);
	let attributes = $state<BarAttributeKey[]>([]);

	const errorFocusTargets: Record<string, string> = {
		'/bar-name': 'bar-name',
		'/address': 'address',
		'/beer-brand': 'beer-brand',
		'/custom-beer-brand': 'custom-beer-brand',
		'/beer-price': 'beer-price',
		'/authors': 'authors-section',
		'/image': 'image-picker-section',
		'/description': 'description',
		'/rating': 'rating',
		'/slug': 'slug'
	};

	const initialRatings = $derived.by<Record<ReviewRatingKey, number>>(
		() =>
			Object.fromEntries(
				REVIEW_RATING_METRICS.map((metric) => [
					metric.key,
					previousFormData?.[metric.key] ?? bar?.[metric.key] ?? 0
				])
			) as Record<ReviewRatingKey, number>
	);

	let ratings = $state<Record<ReviewRatingKey, number>>(createReviewRatingValues());
	let rating = $state(0);
	let clientImageError = $state('');
	let lastFocusedError = $state('');
	let imageFocusX = $state(50);
	let imageFocusY = $state(50);

	$effect(() => {
		barName = initialBarName;
		description = initialDescription;
		address = initialAddress;
		slug = initialSlug;
		beerBrandSelection = initialBeerBrandSelection;
		customBeerBrand = initialCustomBeerBrand;
		beerPriceKr = initialBeerPriceKr;
		isHappyHourPrice = initialIsHappyHourPrice;
		authors = initialAuthors;
		attributes = initialAttributes;
		ratings = initialRatings;
		rating = initialRating;
		imageFocusX = clampImageFocus(initialImageFocusX);
		imageFocusY = clampImageFocus(initialImageFocusY);
	});

	$effect(() => {
		if (!fieldError || fieldError === lastFocusedError) return;
		lastFocusedError = fieldError;
		void focusErrorField(fieldError);
	});

	function hasError(fieldName: string): boolean {
		if (fieldName === 'image' && clientImageError) return true;
		return fieldError === `/${fieldName}` || fieldError === fieldName;
	}

	function getFieldErrorMessage(fieldName: string, fallback: string): string {
		if (fieldName === 'image' && clientImageError) return clientImageError;
		return hasError(fieldName) && fieldMessage ? fieldMessage : fallback;
	}

	async function focusErrorField(pointer: string) {
		const normalizedPointer = pointer.startsWith('/') ? pointer : `/${pointer}`;
		const targetId = errorFocusTargets[normalizedPointer];
		if (!targetId) return;

		await tick();

		const target = document.getElementById(targetId);
		if (!target) return;

		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (target instanceof HTMLElement) {
			target.focus({ preventScroll: true });
		}
	}

	function handleSubmit(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		const imageInput = form.elements.namedItem('image') as HTMLInputElement | null;
		const imageError = validateImageFile(imageInput?.files?.[0], mode === 'create');

		if (imageError) {
			event.preventDefault();
			clientImageError = imageError;
			const imageSection = document.getElementById('image-picker-section') as HTMLElement | null;
			imageSection?.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
			(
				imageSection?.querySelector<HTMLButtonElement>('[aria-label="Bildutsnitt"]') ?? imageSection
			)?.focus();
		}
	}

	function autoGenerateSlug() {
		slug = generateSlug(barName || '');
	}
</script>

<form method="post" enctype="multipart/form-data" class="space-y-6" onsubmit={handleSubmit}>
	<!-- Grundinformation -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-4">Grundinformation</h2>

		<div>
			<label
				for="bar-name"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>Barens namn</label
			>
			<input
				type="text"
				name="bar-name"
				id="bar-name"
				class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
					'bar-name'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={barName}
				required
			/>
			{#if hasError('bar-name')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('bar-name', 'Barens namn är obligatoriskt')}
				</p>
			{/if}
		</div>

		<BeerBrandFields
			bind:beerBrandSelection
			bind:customBeerBrand
			{hasError}
			{getFieldErrorMessage}
		/>
		<div class="mt-4">
			<label
				for="address"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>Adress</label
			>
			<input
				type="text"
				name="address"
				id="address"
				class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
					'address'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={address}
				required
			/>
			{#if hasError('address')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('address', 'Adress är obligatorisk')}
				</p>
			{/if}
		</div>

		<BeerPriceFields bind:beerPriceKr bind:isHappyHourPrice {hasError} {getFieldErrorMessage} />
		<AttributeSelection bind:attributes />
		<AuthorSelection {selectableAuthors} bind:authors {hasError} {getFieldErrorMessage} />
		<ImagePicker
			{mode}
			existingImage={bar?.image}
			bind:imageFocusX
			bind:imageFocusY
			bind:clientImageError
			{hasError}
			{getFieldErrorMessage}
		/>
	</div>

	<!-- Beskrivning -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-4">Beskrivning</h2>

		<label
			for="description"
			class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
		>
			Din recension (Markdown)
		</label>
		<textarea
			name="description"
			id="description"
			rows="6"
			placeholder={descriptionTemplate}
			class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 resize-none {hasError(
				'description'
			)
				? 'ring-2 ring-red-600'
				: ''}"
			bind:value={description}
			required
		></textarea>
		<p class="mt-2 text-xs text-slate-500">
			Skriv med <code>**fetstil**</code>, <code>*kursiv*</code>, <code>- punktlista</code> eller
			<code>1. numrerad lista</code>.
		</p>
		{#if hasError('description')}
			<p class="text-red-400 text-xs mt-1">
				{getFieldErrorMessage('description', 'Beskrivning är obligatorisk')}
			</p>
		{/if}
	</div>

	<RatingFields bind:ratings bind:rating {hasError} {getFieldErrorMessage}>
		{#snippet afterMetrics()}
			<PriceComparisonChart
				points={priceComparison}
				{barName}
				{beerPriceKr}
				valueRating={ratings.price}
			/>
		{/snippet}
	</RatingFields>
	<!-- Avancerade inställningar -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-4">Avancerade inställningar</h2>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
			<div class="flex-1">
				<label
					for="slug"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>
					URL-slug
				</label>
				<input
					type="text"
					name="slug"
					id="slug"
					class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 text-sm {hasError(
						'slug'
					)
						? 'ring-2 ring-red-600'
						: ''}"
					bind:value={slug}
					required
				/>
			</div>
			<button
				type="button"
				onclick={() => autoGenerateSlug()}
				class="rounded-full border border-white/85 bg-white/82 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white"
			>
				Generera automatiskt
			</button>
		</div>
		<p class="text-xs text-slate-500 mt-2">
			Detta används i URL:en (t.ex. /barens-namn). Svenska tecken (åäö) är tillåtna.
		</p>
		{#if hasError('slug')}
			<p class="text-red-400 text-xs mt-1">
				{getFieldErrorMessage('slug', 'Slug är obligatorisk eller finns redan')}
			</p>
		{/if}
	</div>

	{#if mode === 'edit' && bar}
		<input type="hidden" name="id" value={bar._id} />
	{/if}

	<div class="flex flex-col gap-3 sm:flex-row">
		<button
			type="submit"
			class="flex-1 rounded-full border border-white/85 bg-white/82 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white"
		>
			{mode === 'edit' ? 'Uppdatera recension' : 'Spara utkast'}
		</button>
		<button
			type="reset"
			class="flex-1 rounded-full border border-white/85 bg-white/75 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white/90"
		>
			Rensa
		</button>
	</div>
</form>
