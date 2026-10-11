<script lang="ts">
	import Bold from '@lucide/svelte/icons/bold';
	import Eye from '@lucide/svelte/icons/eye';
	import Heading2 from '@lucide/svelte/icons/heading-2';
	import List from '@lucide/svelte/icons/list';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Star from '@lucide/svelte/icons/star';
	import { tick } from 'svelte';
	import ReviewDescription from '../ReviewDescription.svelte';
	import { overallRatingWord } from '$lib/review-wizard';
	import {
		continueListOnEnter,
		toggleLinePrefix,
		wrapSelection
	} from '$lib/utils/markdown-editing';

	interface Props {
		/** The rating from the aspects. */
		suggestedRating: number;
		weightedScore: number;
		/** A rating that the reviewer chose instead of the suggestion. */
		overallOverride: number | null;
		description: string;
		problems: Record<string, string>;
	}

	let {
		suggestedRating,
		weightedScore,
		overallOverride = $bindable(),
		description = $bindable(),
		problems
	}: Props = $props();

	const placeholder = '- Öppen lokal med fin inredning\n- Lugnt nog att prata';
	let textarea = $state<HTMLTextAreaElement | null>(null);
	let isPreviewing = $state(false);

	const rating = $derived(overallOverride ?? suggestedRating);
	const ratingError = $derived(problems['/rating']);
	const descriptionError = $derived(problems['/description']);
	const scoreText = $derived(weightedScore.toLocaleString('sv-SE', { maximumFractionDigits: 2 }));

	function setRating(value: number) {
		overallOverride = value === suggestedRating ? null : value;
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
			tabindex="-1"
			class="mt-4 flex justify-center gap-2"
			role="group"
			aria-label="Helhetsbetyg"
		>
			{#each [1, 2, 3] as star (star)}
				<button
					type="button"
					class="cursor-pointer rounded-2xl p-1.5 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-sky-500 active:scale-95 motion-reduce:active:scale-100"
					aria-label="{star} av 3"
					aria-pressed={rating === star}
					onclick={() => setRating(rating === star ? 0 : star)}
				>
					<Star
						class="size-14 {star <= rating
							? 'fill-amber-500 text-amber-600'
							: 'fill-transparent text-slate-300'}"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
				</button>
			{/each}
		</div>
		<input type="hidden" name="rating" value={rating} />
		<p class="mt-2 font-serif text-2xl font-semibold text-slate-900" aria-live="polite">
			{overallRatingWord(rating)}
		</p>
		{#if overallOverride === null}
			<p class="field-help mt-2">
				Förslag från betygen: {scoreText} poäng. Tryck på en stjärna för att ändra. Tryck på samma stjärna
				igen för noll.
			</p>
		{:else}
			<p class="field-help mt-2">
				Ändrat från förslaget, {suggestedRating}/3.
				<button
					type="button"
					class="cursor-pointer font-semibold text-amber-800 underline-offset-4 hover:underline"
					onclick={() => (overallOverride = null)}
				>
					Använd förslaget
				</button>
			</p>
		{/if}
		{#if ratingError}
			<p class="field-error mt-2">{ratingError}</p>
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
