<script lang="ts">
	import BeerBrandFields from './review-form/BeerBrandFields.svelte';
	import BeerPriceFields from './review-form/BeerPriceFields.svelte';
	import AuthorSelection from './review-form/AuthorSelection.svelte';
	import RatingFields from './review-form/RatingFields.svelte';

	import { tick } from 'svelte';
	import { OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
	import {
		MAX_REVIEW_IMAGE_SIZE_BYTES,
		REVIEW_IMAGE_ACCEPT,
		REVIEW_IMAGE_ALLOWED_TYPES_LABEL,
		REVIEW_IMAGE_TOO_LARGE_MESSAGE,
		descriptionTemplate
	} from '$lib/constants';
	import { REVIEW_RATING_METRICS, createReviewRatingValues } from '$lib/review-metadata';
	import { generateSlug } from '$lib/utils/slug';
	import { getReviewAuthorOptions } from '$lib/utils/authors';
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
	}

	let {
		mode,
		bar = null,
		fieldError = '',
		fieldMessage = '',
		previousFormData = null,
		availableUsers = [],
		currentUsername = ''
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

	let selectedImagePreview = $state('');
	let imageInput = $state<HTMLInputElement | null>(null);
	let imagePreviewFrame = $state<HTMLButtonElement | null>(null);
	let objectUrlToRevoke = '';

	const currentImagePreview = $derived.by(() => {
		if (selectedImagePreview) return selectedImagePreview;
		if (!bar?.image) return '';
		if (
			bar.image.startsWith('http://') ||
			bar.image.startsWith('https://') ||
			bar.image.startsWith('/')
		) {
			return bar.image;
		}
		return `/images/${bar.image}`;
	});

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
		ratings = initialRatings;
		rating = initialRating;
		imageFocusX = clampImageFocus(initialImageFocusX);
		imageFocusY = clampImageFocus(initialImageFocusY);
	});

	$effect(() => {
		return () => {
			if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
		};
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

	function validateImageFile(file: File | undefined): string {
		if (!file) {
			return mode === 'create' ? 'Välj en bildfil' : '';
		}

		if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
			return REVIEW_IMAGE_TOO_LARGE_MESSAGE;
		}

		if (!REVIEW_IMAGE_ACCEPT.split(',').includes(file.type)) {
			return `Ogiltig filtyp. Endast ${REVIEW_IMAGE_ALLOWED_TYPES_LABEL} är tillåtna`;
		}

		return '';
	}

	function clampImageFocus(value: number): number {
		if (!Number.isFinite(value)) return 50;
		return Math.min(100, Math.max(0, value));
	}

	function openImagePicker() {
		imageInput?.click();
	}

	function handleImageChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		clientImageError = validateImageFile(file);

		if (objectUrlToRevoke) {
			URL.revokeObjectURL(objectUrlToRevoke);
			objectUrlToRevoke = '';
		}

		if (!file || clientImageError) {
			selectedImagePreview = '';
			return;
		}

		objectUrlToRevoke = URL.createObjectURL(file);
		selectedImagePreview = objectUrlToRevoke;
	}

	function updateImageFocusFromPointer(event: PointerEvent) {
		const target = imagePreviewFrame;
		if (!target) return;

		const rect = target.getBoundingClientRect();
		imageFocusX = clampImageFocus(((event.clientX - rect.left) / rect.width) * 100);
		imageFocusY = clampImageFocus(((event.clientY - rect.top) / rect.height) * 100);
	}

	function handleImageFocusPointerDown(event: PointerEvent) {
		event.preventDefault();
		imagePreviewFrame?.setPointerCapture(event.pointerId);
		updateImageFocusFromPointer(event);
	}

	function handleImageFocusPointerMove(event: PointerEvent) {
		if (!(event.buttons & 1)) return;
		updateImageFocusFromPointer(event);
	}

	function handleImageFocusKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 2;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			imageFocusX = clampImageFocus(imageFocusX - step);
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			imageFocusX = clampImageFocus(imageFocusX + step);
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			imageFocusY = clampImageFocus(imageFocusY - step);
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			imageFocusY = clampImageFocus(imageFocusY + step);
		}
	}

	function handleSubmit(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		const imageInput = form.elements.namedItem('image') as HTMLInputElement | null;
		const imageError = validateImageFile(imageInput?.files?.[0]);

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

<form
	method="post"
	enctype="multipart/form-data"
	class="mt-4 space-y-6 max-w-2xl"
	onsubmit={handleSubmit}
>
	<!-- Grundinformation -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
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
		<AuthorSelection {selectableAuthors} bind:authors {hasError} {getFieldErrorMessage} />

		<div id="image-picker-section" class="mt-4" tabindex="-1">
			<label
				for="image"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
			>
				Bild {mode === 'edit' ? '(valfritt)' : '(obligatoriskt)'}
			</label>
			<input
				bind:this={imageInput}
				type="file"
				name="image"
				id="image"
				class="sr-only"
				accept={REVIEW_IMAGE_ACCEPT}
				onchange={handleImageChange}
			/>
			<input type="hidden" name="imageFocusX" value={imageFocusX.toFixed(2)} />
			<input type="hidden" name="imageFocusY" value={imageFocusY.toFixed(2)} />

			<div class="space-y-3">
				<button
					type="button"
					onclick={openImagePicker}
					class="w-full rounded-2xl border border-white/85 bg-white/82 px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-slate-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
						'image'
					)
						? 'ring-2 ring-red-600'
						: ''}"
				>
					{currentImagePreview ? 'Byt bild' : 'Välj bild'}
				</button>

				{#if currentImagePreview}
					<button
						bind:this={imagePreviewFrame}
						type="button"
						class="relative aspect-[16/9] w-full touch-none overflow-hidden rounded-2xl border border-white/85 bg-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200"
						aria-label="Bildutsnitt"
						onpointerdown={handleImageFocusPointerDown}
						onpointermove={handleImageFocusPointerMove}
						onkeydown={handleImageFocusKeydown}
					>
						<img
							src={currentImagePreview}
							alt=""
							class="h-full w-full object-cover"
							style={`object-position: ${imageFocusX}% ${imageFocusY}%`}
						/>
						<span
							class="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.35),0_8px_20px_rgba(15,23,42,0.25)]"
							style={`left: ${imageFocusX}%; top: ${imageFocusY}%`}
						></span>
					</button>
				{/if}
			</div>

			{#if hasError('image')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('image', 'Välj en bildfil')}
				</p>
			{/if}
		</div>
	</div>

	<!-- Beskrivning -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
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

	<RatingFields bind:ratings bind:rating {hasError} {getFieldErrorMessage} />
	<!-- Avancerade inställningar -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
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
