<script lang="ts">
	import AlignLeft from '@lucide/svelte/icons/text-align-start';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Beer from '@lucide/svelte/icons/beer';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Lock from '@lucide/svelte/icons/lock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Star from '@lucide/svelte/icons/star';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import { onDestroy, onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import WizardAuthorsStep from './review-wizard/WizardAuthorsStep.svelte';
	import WizardBarStep from './review-wizard/WizardBarStep.svelte';
	import WizardBeerStep from './review-wizard/WizardBeerStep.svelte';
	import WizardPhotoStep from './review-wizard/WizardPhotoStep.svelte';
	import WizardRatingStep from './review-wizard/WizardRatingStep.svelte';
	import WizardTextStep from './review-wizard/WizardTextStep.svelte';
	import { normalizeBarAttributes } from '$lib/bar-attributes';
	import { OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
	import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
	import {
		REVIEW_WIZARD_STEPS,
		REVIEW_WIZARD_STEP_TITLES,
		firstWizardProblem,
		overallRatingWord,
		weightedReviewScore,
		wizardStepForPointer,
		wizardStepProblems,
		type ReviewWizardProblems,
		type ReviewWizardStep,
		type ReviewWizardValues
	} from '$lib/review-wizard';
	import { getReviewAuthorOptions } from '$lib/utils/authors';
	import { clampImageFocus, validateImageFile } from '$lib/utils/review-image';
	import { calculateOverallRating } from '$lib/utils/ratings';
	import { generateSlug } from '$lib/utils/slug';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import type { PriceComparisonPoint } from '$lib/types/price-comparison';
	import type {
		BarReviewFormData,
		ReviewRatingValues,
		SerializedBarReview
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

	// The form starts from the values that the server sent back after a rejected save, then from
	// the review being edited. The page creates a new wizard for each review, so this runs once.
	function initialValues() {
		const previous = previousFormData;
		const brand = bar?.beerBrand?.trim() ?? '';
		const price = previous?.beerPriceKr ?? bar?.beerPriceKr;
		const ratings = Object.fromEntries(
			REVIEW_RATING_METRICS.map((metric) => [
				metric.key,
				previous?.[metric.key] ?? bar?.[metric.key] ?? 0
			])
		) as ReviewRatingValues;
		const rating = previous?.rating ?? bar?.rating;
		const barName = previous?.barName ?? bar?.title ?? '';
		const slug = previous?.slug ?? bar?.slug ?? '';
		const suggested = calculateOverallRating(REVIEW_RATING_METRICS.map((m) => ratings[m.key]));
		const pointerStep = fieldError ? wizardStepForPointer(fieldError) : null;
		return {
			barName,
			address: previous?.address ?? bar?.location ?? '',
			slug,
			slugEdited: mode === 'edit' || (slug !== '' && slug !== generateSlug(barName)),
			beerBrandSelection:
				previous?.beerBrandSelection ??
				(brand ? (isListedBeerBrand(brand) ? brand : OTHER_BEER_BRAND_VALUE) : ''),
			customBeerBrand:
				previous?.customBeerBrand ?? (brand && !isListedBeerBrand(brand) ? brand : ''),
			beerPriceKr: typeof price === 'number' && Number.isFinite(price) ? String(price) : '',
			isHappyHourPrice: previous?.isHappyHourPrice ?? bar?.isHappyHourPrice ?? false,
			attributes: normalizeBarAttributes(previous?.attributes ?? bar?.attributes),
			authors:
				previous?.authors ??
				getReviewAuthorOptions(currentUsername, [], mode === 'edit' ? bar : null),
			ratings,
			overallOverride:
				typeof rating === 'number' && Number.isInteger(rating) && rating !== suggested
					? rating
					: null,
			description: previous?.description ?? bar?.description ?? '',
			imageFocusX: clampImageFocus(previous?.imageFocusX ?? bar?.imageFocusX ?? 50),
			imageFocusY: clampImageFocus(previous?.imageFocusY ?? bar?.imageFocusY ?? 50),
			problems: (pointerStep && fieldMessage
				? { [fieldError.startsWith('/') ? fieldError : `/${fieldError}`]: fieldMessage }
				: {}) as ReviewWizardProblems,
			step: pointerStep ?? 'photo',
			// A rejected save means the reviewer has seen every step.
			furthest: fieldError || mode === 'edit' ? REVIEW_WIZARD_STEPS.length - 1 : 0,
			// An edit starts on the list of steps, unless the server pointed at a field.
			showsOverview: mode === 'edit' && !(pointerStep && fieldMessage)
		};
	}

	const initial = initialValues();

	let barName = $state(initial.barName);
	let address = $state(initial.address);
	let slug = $state(initial.slug);
	let slugEdited = $state(initial.slugEdited);
	let beerBrandSelection = $state(initial.beerBrandSelection);
	let customBeerBrand = $state(initial.customBeerBrand);
	let beerPriceKr = $state<string | number | undefined>(initial.beerPriceKr);
	let isHappyHourPrice = $state(initial.isHappyHourPrice);
	let attributes = $state<BarAttributeKey[]>(initial.attributes);
	let authors = $state<string[]>(initial.authors);
	let ratings = $state<ReviewRatingValues>(initial.ratings);
	let overallOverride = $state<number | null>(initial.overallOverride);
	let description = $state(initial.description);
	let imageFocusX = $state(initial.imageFocusX);
	let imageFocusY = $state(initial.imageFocusY);
	let newImage = $state<{ file: File; url: string } | null>(null);
	let imageError = $state('');

	// Without scripts the form shows every step at once and submits natively.
	let enhanced = $state(false);
	let step = $state<ReviewWizardStep>(initial.step);
	let furthest = $state(initial.furthest);
	let ratingIndex = $state(0);
	let showsOverview = $state(initial.showsOverview);
	let forward = $state(true);
	let problems = $state<ReviewWizardProblems>(initial.problems);
	let isSubmitting = $state(false);
	let saveButton = $state<HTMLButtonElement | null>(null);

	const selectableAuthors = $derived(
		getReviewAuthorOptions(
			currentUsername,
			availableUsers.map((user) => user.username),
			mode === 'edit' ? bar : null
		)
	);
	const existingImageUrl = $derived.by(() => {
		const image = bar?.image;
		if (!image) return '';
		return /^(https?:|\/)/.test(image) ? image : `/images/${image}`;
	});
	const previewUrl = $derived(newImage?.url ?? existingImageUrl);
	const weightedScore = $derived(weightedReviewScore(ratings));
	const suggestedRating = $derived(
		calculateOverallRating(REVIEW_RATING_METRICS.map((metric) => ratings[metric.key]))
	);
	const overallRating = $derived(overallOverride ?? suggestedRating);
	const brand = $derived(
		(beerBrandSelection === OTHER_BEER_BRAND_VALUE ? customBeerBrand : beerBrandSelection).trim()
	);
	const stepIndex = $derived(REVIEW_WIZARD_STEPS.indexOf(step));
	const metricCount = REVIEW_RATING_METRICS.length;
	const isLastCreateStep = $derived(mode === 'create' && step === 'authors');
	const hasMoreMetrics = $derived(step === 'ratings' && ratingIndex < metricCount - 1);

	const values = (): ReviewWizardValues => ({
		mode,
		hasImage: Boolean(newImage),
		imageError,
		barName,
		address,
		slug,
		beerBrandSelection,
		customBeerBrand,
		beerPriceKr,
		description,
		authors
	});

	// A snapshot to tell whether leaving the page would lose work.
	const snapshot = () =>
		JSON.stringify([
			barName,
			address,
			slug,
			beerBrandSelection,
			customBeerBrand,
			String(beerPriceKr ?? ''),
			isHappyHourPrice,
			attributes,
			authors,
			ratings,
			overallRating,
			description,
			imageFocusX,
			imageFocusY,
			Boolean(newImage)
		]);
	let initialSnapshot = '';

	$effect(() => {
		if (mode === 'create' && !slugEdited) slug = generateSlug(barName);
	});

	onMount(() => {
		initialSnapshot = snapshot();
		enhanced = true;
		if (Object.keys(problems).length) void focusProblem(Object.keys(problems)[0]);
	});

	onDestroy(() => {
		if (newImage) URL.revokeObjectURL(newImage.url);
	});

	beforeNavigate(({ cancel, type }) => {
		if (isSubmitting || !initialSnapshot || snapshot() === initialSnapshot) return;
		if (type === 'leave') {
			cancel();
			return;
		}
		if (!confirm('Vill du lämna recensionen? Ändringarna sparas inte.')) cancel();
	});

	function handleFileChange(file: File | undefined) {
		imageError = validateImageFile(file, mode === 'create');
		if (newImage) URL.revokeObjectURL(newImage.url);
		newImage = file && !imageError ? { file, url: URL.createObjectURL(file) } : null;
		if (newImage) {
			imageFocusX = 50;
			imageFocusY = 50;
		}
		problems = { ...withoutStep('photo'), ...wizardStepProblems('photo', values()) };
		if (!imageError) delete problems['/image'];
	}

	function withoutStep(target: ReviewWizardStep): ReviewWizardProblems {
		return Object.fromEntries(
			Object.entries(problems).filter(([pointer]) => wizardStepForPointer(pointer) !== target)
		);
	}

	/** Shows the problems of a step. True when the step is complete. */
	function validate(target: ReviewWizardStep): boolean {
		const stepProblems = wizardStepProblems(target, values());
		problems = { ...withoutStep(target), ...stepProblems };
		const [first] = Object.keys(stepProblems);
		if (first) void focusProblem(first);
		return !first;
	}

	const problemTargets: Record<string, string> = {
		'/image': 'image-picker-section',
		'/bar-name': 'bar-name',
		'/address': 'address',
		'/slug': 'slug',
		'/beer-price': 'beer-price',
		'/beer-brand': 'beer-brand',
		'/custom-beer-brand': 'custom-beer-brand',
		'/rating': 'rating',
		'/description': 'description',
		'/authors': 'authors-section'
	};

	async function focusProblem(pointer: string) {
		const normalized = pointer.startsWith('/') ? pointer : `/${pointer}`;
		await tick();
		const slugDetails = document.getElementById('slug')?.closest('details');
		if (normalized === '/slug' && slugDetails) slugDetails.open = true;
		const target = document.getElementById(problemTargets[normalized] ?? '');
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	async function focusStep() {
		await tick();
		const section = document.getElementById(`wizard-step-${step}`);
		section?.querySelector<HTMLElement>('.wizard-heading')?.focus({ preventScroll: true });
		document.getElementById('review-wizard')?.scrollIntoView({ block: 'start' });
	}

	function goTo(target: ReviewWizardStep) {
		const targetIndex = REVIEW_WIZARD_STEPS.indexOf(target);
		forward = targetIndex >= stepIndex;
		if (target === 'ratings') ratingIndex = forward ? 0 : metricCount - 1;
		step = target;
		furthest = Math.max(furthest, targetIndex);
		void focusStep();
	}

	function open(target: ReviewWizardStep) {
		forward = true;
		ratingIndex = 0;
		step = target;
		showsOverview = false;
		void focusStep();
	}

	async function returnToOverview() {
		showsOverview = true;
		await tick();
		document.getElementById(`wizard-row-${step}`)?.focus();
	}

	function next() {
		if (hasMoreMetrics) {
			forward = true;
			ratingIndex += 1;
			return;
		}
		if (!validate(step)) return;
		if (mode === 'edit') void returnToOverview();
		else {
			const following = REVIEW_WIZARD_STEPS[stepIndex + 1];
			if (following) goTo(following);
		}
	}

	function back() {
		if (step === 'ratings' && ratingIndex > 0) {
			forward = false;
			ratingIndex -= 1;
		} else if (mode === 'edit') void returnToOverview();
		else if (stepIndex > 0) goTo(REVIEW_WIZARD_STEPS[stepIndex - 1]);
	}

	function handleSubmit(event: SubmitEvent) {
		if (!enhanced) return;
		// Enter in a text field submits the form; on a step that only moves on.
		if (event.submitter !== saveButton) {
			event.preventDefault();
			next();
			return;
		}
		const problem = firstWizardProblem(values());
		if (problem) {
			event.preventDefault();
			problems = { ...withoutStep(problem.step), ...wizardStepProblems(problem.step, values()) };
			showsOverview = false;
			forward = REVIEW_WIZARD_STEPS.indexOf(problem.step) >= stepIndex;
			step = problem.step;
			void focusProblem(problem.pointer);
			return;
		}
		isSubmitting = true;
	}

	// A step has no submit button, so Enter in a one-line field moves to the next step.
	function handleKeydown(event: KeyboardEvent) {
		const target = event.target;
		if (!enhanced || event.key !== 'Enter' || event.isComposing) return;
		if (
			!(target instanceof HTMLInputElement) ||
			['checkbox', 'radio', 'file'].includes(target.type)
		) {
			return;
		}
		event.preventDefault();
		if (mode === 'edit' && showsOverview) saveButton?.click();
		else if (isLastCreateStep) saveButton?.click();
		else next();
	}

	function isHidden(target: ReviewWizardStep) {
		return enhanced && (showsOverview || step !== target);
	}

	function hasProblems(target: ReviewWizardStep) {
		return Object.keys(problems).some((pointer) => wizardStepForPointer(pointer) === target);
	}

	const stepIcons = {
		photo: ImageIcon,
		bar: MapPin,
		beer: Beer,
		ratings: Star,
		text: AlignLeft,
		authors: Users
	};

	function summary(target: ReviewWizardStep): string {
		switch (target) {
			case 'photo':
				return newImage ? 'Ny bild' : 'Nuvarande bild';
			case 'bar':
				return [barName, address.split(',')[0]].filter((part) => part.trim()).join(' · ');
			case 'beer': {
				const price = String(beerPriceKr ?? '').trim();
				return [brand, price && `${price} kr${isHappyHourPrice ? '*' : ''}`]
					.filter(Boolean)
					.join(' · ');
			}
			case 'ratings':
				return `Viktat ${weightedScore.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} av 5`;
			case 'text': {
				const lines = description.split('\n').filter((line) => line.trim()).length;
				return `${overallRatingWord(overallRating)} · ${lines} ${lines === 1 ? 'rad' : 'rader'}`;
			}
			case 'authors':
				return selectableAuthors.filter((name) => authors.includes(name)).join(', ');
		}
	}

	const nextLabel = $derived.by(() => {
		if (hasMoreMetrics) return `Nästa: ${REVIEW_RATING_METRICS[ratingIndex + 1].label}`;
		if (mode === 'edit') return 'Klar';
		const following = REVIEW_WIZARD_STEPS[stepIndex + 1];
		return following ? `Nästa: ${REVIEW_WIZARD_STEP_TITLES[following]}` : 'Spara utkast';
	});
	const canGoBack = $derived(
		mode === 'edit' ? step === 'ratings' && ratingIndex > 0 : stepIndex > 0
	);
</script>

<!-- Enter in a field moves to the next step; the fields themselves stay native. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	id="review-wizard"
	method="post"
	enctype="multipart/form-data"
	class="mx-auto max-w-xl scroll-mt-24"
	novalidate={enhanced}
	onsubmit={handleSubmit}
	onkeydown={handleKeydown}
>
	{#if enhanced}
		<div class="mb-6 flex min-h-11 items-center gap-3">
			{#if mode === 'edit' && !showsOverview}
				<button
					type="button"
					class="btn btn-secondary size-11 shrink-0 px-0"
					aria-label="Alla steg"
					onclick={returnToOverview}
				>
					<ChevronLeft class="size-5" aria-hidden="true" />
				</button>
			{:else}
				<a
					href={mode === 'edit' && bar
						? resolve('/[slug]', { slug: encodeURIComponent(bar.slug) })
						: resolve('/admin/reviews')}
					class="btn btn-secondary size-11 shrink-0 px-0"
					aria-label="Avbryt"
				>
					<X class="size-5" aria-hidden="true" />
				</a>
			{/if}
			<div class="flex flex-1 justify-center">
				{#if mode === 'edit'}
					<p class="font-semibold text-slate-900">
						{showsOverview ? '' : REVIEW_WIZARD_STEP_TITLES[step]}
					</p>
				{:else}
					<ol class="flex items-center gap-1" aria-label="Steg">
						{#each REVIEW_WIZARD_STEPS as item, position (item)}
							<li>
								<button
									type="button"
									class="flex h-11 cursor-pointer items-center px-0.5 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-default"
									aria-label="Steg {position +
										1} av {REVIEW_WIZARD_STEPS.length}, {REVIEW_WIZARD_STEP_TITLES[
										item
									]}{hasProblems(item) ? ', har fel' : ''}"
									aria-current={item === step ? 'step' : undefined}
									disabled={position > furthest}
									onclick={() => item !== step && goTo(item)}
								>
									<span
										class="block h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none {item ===
										step
											? 'w-7'
											: 'w-3'} {hasProblems(item)
											? 'bg-red-600'
											: position <= stepIndex
												? 'bg-amber-600'
												: position <= furthest
													? 'bg-slate-400'
													: 'bg-slate-300'}"
									></span>
								</button>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
			<span class="size-11 shrink-0" aria-hidden="true"></span>
		</div>
	{/if}

	{#if enhanced && showsOverview}
		<ul class="space-y-2" aria-label="Recensionens delar">
			{#each REVIEW_WIZARD_STEPS as item (item)}
				{@const Icon = hasProblems(item) ? CircleAlert : stepIcons[item]}
				<li>
					<button
						type="button"
						id="wizard-row-{item}"
						class="glass-panel flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
						onclick={() => open(item)}
					>
						{#if item === 'photo' && previewUrl}
							<img src={previewUrl} alt="" class="size-10 shrink-0 rounded-xl object-cover" />
						{:else}
							<span
								class="flex size-10 shrink-0 items-center justify-center rounded-full {hasProblems(
									item
								)
									? 'bg-red-100 text-red-800'
									: 'bg-amber-100 text-amber-900'}"
							>
								<Icon class="size-4" aria-hidden="true" />
							</span>
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block font-semibold text-slate-900">
								{REVIEW_WIZARD_STEP_TITLES[item]}
							</span>
							<span
								class="block truncate text-sm {hasProblems(item)
									? 'text-red-700'
									: 'text-slate-600'}"
							>
								{hasProblems(item) ? 'Behöver rättas' : summary(item) || 'Inte ifyllt'}
							</span>
						</span>
						<ChevronRight class="size-4 shrink-0 text-slate-400" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#each REVIEW_WIZARD_STEPS as item (item)}
		<section
			id="wizard-step-{item}"
			class={enhanced ? 'wizard-step' : 'glass-panel mb-6 p-6 sm:p-8'}
			class:wizard-step--back={enhanced && !forward}
			hidden={isHidden(item)}
		>
			{#if item === 'photo'}
				<WizardPhotoStep
					{mode}
					{previewUrl}
					bind:imageFocusX
					bind:imageFocusY
					error={problems['/image']}
					onFileChange={handleFileChange}
				/>
			{:else if item === 'bar'}
				<WizardBarStep
					{mode}
					{previewUrl}
					bind:barName
					bind:address
					bind:slug
					bind:slugEdited
					bind:attributes
					{problems}
					onGenerateSlug={() => (slug = generateSlug(barName))}
				/>
			{:else if item === 'beer'}
				<WizardBeerStep
					bind:beerPriceKr
					bind:isHappyHourPrice
					bind:beerBrandSelection
					bind:customBeerBrand
					{problems}
				/>
			{:else if item === 'ratings'}
				<WizardRatingStep
					bind:ratings
					bind:index={ratingIndex}
					{enhanced}
					{problems}
					{priceComparison}
					{barName}
					{beerPriceKr}
				/>
			{:else if item === 'text'}
				<WizardTextStep
					{suggestedRating}
					{weightedScore}
					bind:overallOverride
					bind:description
					{problems}
				/>
			{:else}
				<WizardAuthorsStep
					{selectableAuthors}
					bind:authors
					{currentUsername}
					{problems}
					isDraft={mode === 'create' || bar?.publicationStatus === 'draft'}
					preview={{
						title: barName,
						description,
						rating: overallRating,
						image: previewUrl,
						imageFocusX,
						imageFocusY,
						location: address,
						beerBrand: brand,
						beerPriceKr: Number(beerPriceKr) || undefined,
						isHappyHourPrice,
						attributes
					}}
				/>
			{/if}
		</section>
	{/each}

	{#if mode === 'edit' && bar}
		<input type="hidden" name="id" value={bar._id} />
	{/if}

	<div
		class="wizard-actions sticky bottom-0 z-20 -mx-4 mt-8 px-4 pt-6 pb-4 sm:-mx-6 sm:px-6"
		class:hidden={enhanced && mode === 'create' && step === 'photo' && !previewUrl}
	>
		{#if !enhanced || (mode === 'edit' && showsOverview)}
			<button
				bind:this={saveButton}
				type="submit"
				class="btn btn-primary min-h-14 w-full text-base"
				disabled={isSubmitting}
			>
				<Check class="size-5" aria-hidden="true" />
				{#if isSubmitting}Sparar…{:else if mode === 'edit'}Spara ändringar{:else}Spara utkast{/if}
			</button>
		{:else}
			<div class="flex gap-3">
				{#if canGoBack}
					<button
						type="button"
						class="btn btn-secondary size-14 shrink-0 px-0"
						aria-label="Tillbaka"
						onclick={back}
					>
						<ChevronLeft class="size-5" aria-hidden="true" />
					</button>
				{/if}
				{#if isLastCreateStep}
					<button
						bind:this={saveButton}
						type="submit"
						class="btn btn-primary min-h-14 flex-1 text-base"
						disabled={isSubmitting}
					>
						<Lock class="size-4" aria-hidden="true" />
						{isSubmitting ? 'Sparar…' : 'Spara utkast'}
					</button>
				{:else}
					<button type="button" class="btn btn-primary min-h-14 flex-1 text-base" onclick={next}>
						{nextLabel}
						{#if mode === 'edit' && !hasMoreMetrics}
							<Check class="size-5" aria-hidden="true" />
						{:else}
							<ArrowRight class="size-5" aria-hidden="true" />
						{/if}
					</button>
				{/if}
			</div>
		{/if}
		{#if isLastCreateStep}
			<p class="field-help mt-2 text-center">Utkastet är privat tills det publiceras.</p>
		{/if}
	</div>
</form>

<style>
	.wizard-actions {
		background: linear-gradient(to bottom, transparent, var(--color-bg-0) 1.5rem);
	}

	.wizard-step:not([hidden]) {
		animation: wizard-step-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.wizard-step--back:not([hidden]) {
		animation-name: wizard-step-back;
	}

	@keyframes wizard-step-in {
		from {
			opacity: 0;
			transform: translateX(1.5rem);
		}
	}

	@keyframes wizard-step-back {
		from {
			opacity: 0;
			transform: translateX(-1.5rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wizard-step:not([hidden]),
		.wizard-step--back:not([hidden]) {
			animation-name: wizard-step-fade;
		}

		@keyframes wizard-step-fade {
			from {
				opacity: 0;
			}
		}
	}

	:global(.wizard-heading) {
		font-family: var(--font-serif);
		font-size: 2rem;
		line-height: 1.15;
		font-weight: 600;
		letter-spacing: -0.02em;
		text-wrap: balance;
		color: var(--color-slate-900);
	}

	:global(.wizard-heading:focus) {
		outline: none;
	}
</style>
