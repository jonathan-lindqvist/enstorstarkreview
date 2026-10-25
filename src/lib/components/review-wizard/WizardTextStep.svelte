<script lang="ts">
	import Bold from '@lucide/svelte/icons/bold';
	import Eye from '@lucide/svelte/icons/eye';
	import Heading2 from '@lucide/svelte/icons/heading-2';
	import List from '@lucide/svelte/icons/list';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { onMount, tick } from 'svelte';
	import ReviewDescription from '../ReviewDescription.svelte';
	import RatingGlass from '../RatingGlass.svelte';
	import { MAX_LONG_TEXT } from '$lib/constants';
	import { overallRatingWord } from '$lib/review-wizard';
	import {
		continueListOnEnter,
		toggleLinePrefix,
		wrapSelection
	} from '$lib/utils/markdown-editing';

	interface Props {
		/** The rating from the aspects. */
		suggestedRating: number;
		/** A rating that the reviewer chose instead of the suggestion. */
		overallOverride: number | null;
		description: string;
		/** The rendered text shows instead of the field. */
		isPreviewing?: boolean;
		problems: Record<string, string>;
	}

	let {
		suggestedRating,
		overallOverride = $bindable(),
		description = $bindable(),
		isPreviewing = $bindable(false),
		problems
	}: Props = $props();

	const placeholder = '- Öppen lokal med fin inredning\n- Lugnt nog att prata';
	let textarea = $state<HTMLTextAreaElement | null>(null);

	const rating = $derived(overallOverride ?? suggestedRating);
	const nextRating = $derived((rating + 1) % 4);
	const ratingError = $derived(problems['/rating']);
	const descriptionError = $derived(problems['/description']);
	let glassesReady = $state(false);
	let glassesLoading = $state(false);
	let glassesError = $state('');
	let glassContainer = $state<HTMLDivElement | null>(null);
	let loadGeneration = 0;
	let pointerGesture = 0;
	let handledPointerGesture = 0;

	onMount(() => {
		void loadGlasses();
		return () => {
			loadGeneration += 1;
		};
	});

	async function loadGlasses() {
		if (glassesLoading || !glassContainer) return;
		const generation = ++loadGeneration;
		glassesLoading = true;
		glassesError = '';
		try {
			// Decode the actual mounted artwork so cycling never needs a new image request.
			const images = Array.from(glassContainer.querySelectorAll('img'));
			await Promise.all(
				images.map((image) => {
					const source = image.getAttribute('src');
					if (image.complete && image.naturalWidth === 0 && source) image.src = source;
					return image.decode();
				})
			);
			if (generation === loadGeneration) glassesReady = true;
		} catch {
			if (generation === loadGeneration) glassesError = 'Stämplarna kunde inte laddas.';
		} finally {
			if (generation === loadGeneration) glassesLoading = false;
		}
	}

	function cycleRating(event: MouseEvent) {
		if (!glassesReady) return;
		// Firefox touch emulation can emit clicks both before and after the same pointerup.
		// Keyboard and assistive activations have detail 0 and keep native button behavior.
		if (event.detail > 0 && pointerGesture > 0) {
			if (handledPointerGesture === pointerGesture) return;
			handledPointerGesture = pointerGesture;
		}
		const next = ((overallOverride ?? suggestedRating) + 1) % 4;
		overallOverride = next === suggestedRating ? null : next;
	}

	function beginRatingGesture(event: PointerEvent) {
		if (event.isPrimary && event.button === 0) pointerGesture += 1;
	}

	function cancelRatingGesture() {
		handledPointerGesture = pointerGesture;
	}

	function useSuggestion() {
		if (glassesReady) overallOverride = null;
	}

	async function apply(text: string, start: number, end = start) {
		description = text;
		await tick();
		textarea?.focus();
		textarea?.setSelectionRange(start, end);
	}

	function togglePrefix(prefix: string) {
		const result = toggleLinePrefix(
			description,
			textarea?.selectionStart ?? description.length,
			prefix
		);
		void apply(result.text, result.cursor);
	}

	function bold() {
		const start = textarea?.selectionStart ?? description.length;
		const end = textarea?.selectionEnd ?? start;
		const result = wrapSelection(description, start, end, '**');
		void apply(result.text, result.start, result.end);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing || !textarea) return;
		const result = continueListOnEnter(description, textarea.selectionStart, textarea.selectionEnd);
		if (!result) return;
		event.preventDefault();
		void apply(result.text, result.cursor);
	}
</script>

<div class="space-y-8">
	<div class="glass-panel px-5 py-6 text-center">
		<h2 class="wizard-heading" tabindex="-1">Hur var helheten?</h2>
		<div
			id="rating"
			bind:this={glassContainer}
			tabindex="-1"
			class="mt-4 flex justify-center"
			role="group"
			aria-label="Helhetsbetyg"
		>
			<button
				type="button"
				class="inline-flex size-40 touch-manipulation select-none cursor-pointer items-center justify-center rounded-2xl p-2 hover:bg-amber-100/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 active:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
				aria-label="Helhetsbetyg {rating} av 3. Ändra till {nextRating} av 3."
				aria-describedby="rating-help{ratingError ? ' rating-error' : ''}{glassesError
					? ' rating-image-error'
					: ''}"
				aria-busy={!glassesReady && !glassesError}
				disabled={!glassesReady}
				onpointerdown={beginRatingGesture}
				onpointercancel={cancelRatingGesture}
				onclick={cycleRating}
			>
				{#if rating === 0}
					<span
						class="inline-flex size-36 items-center justify-center text-base font-semibold text-slate-600"
						>Ingen stämpel</span
					>
				{/if}
				{#each [1, 2, 3] as value (value)}
					<span hidden={rating !== value}>
						<RatingGlass rating={value} class="size-36" decorative />
					</span>
				{/each}
			</button>
		</div>
		<input type="hidden" name="rating" value={rating} />
		<p class="sr-only" aria-live="polite" aria-atomic="true">
			Helhetsbetyg {rating} av 3. {overallRatingWord(rating)}.
		</p>
		<p id="rating-help" class="field-help mt-2">Tryck för att byta stämpel.</p>
		{#if !glassesReady && !glassesError}
			<p class="field-help mt-2" role="status">Laddar stämplar…</p>
		{:else if glassesError}
			<p id="rating-image-error" class="field-error mt-2" role="alert">{glassesError}</p>
			<button type="button" class="btn btn-secondary mt-2" onclick={loadGlasses}>Försök igen</button
			>
		{/if}
		{#if overallOverride === null}
			<p class="field-help mt-2">Förslag från delbetygen.</p>
		{:else}
			<p class="field-help mt-2">
				Ändrat från förslaget.
				<button
					type="button"
					class="cursor-pointer font-semibold text-amber-800 underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-60"
					disabled={!glassesReady}
					onclick={useSuggestion}
				>
					Använd förslaget
				</button>
			</p>
		{/if}
		{#if ratingError}
			<p id="rating-error" class="field-error mt-2">{ratingError}</p>
		{/if}
	</div>

	<div>
		<div class="mb-2 flex flex-wrap items-center gap-2">
			<label for="description" class="field-label mr-auto text-base">Recension</label>
			{#if !isPreviewing}
				<button
					type="button"
					class="format-button"
					aria-label="Rubrik"
					onclick={() => togglePrefix('## ')}
				>
					<Heading2 class="size-4" aria-hidden="true" />
				</button>
				<button
					type="button"
					class="format-button"
					aria-label="Punktlista"
					onclick={() => togglePrefix('- ')}
				>
					<List class="size-4" aria-hidden="true" />
				</button>
				<button type="button" class="format-button" aria-label="Fetstil" onclick={bold}>
					<Bold class="size-4" aria-hidden="true" />
				</button>
			{/if}
			<button
				type="button"
				class="chip min-h-9 gap-1.5 px-3 {isPreviewing ? 'chip-on' : 'chip-off'}"
				aria-pressed={isPreviewing}
				onclick={() => (isPreviewing = !isPreviewing)}
			>
				{#if isPreviewing}
					<Pencil class="size-4" aria-hidden="true" /> Skriv
				{:else}
					<Eye class="size-4" aria-hidden="true" /> Förhandsvisa
				{/if}
			</button>
		</div>
		<textarea
			bind:this={textarea}
			name="description"
			id="description"
			rows="9"
			maxlength={MAX_LONG_TEXT}
			{placeholder}
			class="field resize-y"
			hidden={isPreviewing}
			aria-invalid={descriptionError ? true : undefined}
			aria-describedby="description-help{descriptionError ? ' description-error' : ''}"
			bind:value={description}
			onkeydown={handleKeydown}
			required
		></textarea>
		{#if isPreviewing}
			<div class="min-h-56 rounded-2xl border border-slate-300 bg-white px-4 py-3">
				{#if description.trim()}
					<ReviewDescription {description} />
				{:else}
					<p class="text-slate-500">Inget att visa än.</p>
				{/if}
			</div>
		{/if}
		<p id="description-help" class="field-help mt-2">
			En rad i taget. Börja raden med - för en punktlista. Finputsa hemma.
		</p>
		{#if descriptionError}
			<p id="description-error" class="field-error mt-2">{descriptionError}</p>
		{/if}
	</div>
</div>

<style>
	.format-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		color: var(--color-slate-800);
		background: color-mix(in oklab, var(--color-slate-900) 7%, transparent);
		cursor: pointer;
		transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.format-button:hover {
		background: color-mix(in oklab, var(--color-slate-900) 12%, transparent);
	}

	.format-button:focus-visible {
		outline: 2px solid var(--color-sky-500);
		outline-offset: 2px;
	}
</style>
