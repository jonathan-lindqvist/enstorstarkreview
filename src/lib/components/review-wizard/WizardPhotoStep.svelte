<script lang="ts">
	import Beer from '@lucide/svelte/icons/beer';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import { REVIEW_IMAGE_ACCEPT, REVIEW_IMAGE_ALLOWED_TYPES_LABEL } from '$lib/constants';
	import PhotoCropper from './PhotoCropper.svelte';

	interface Props {
		mode: 'create' | 'edit';
		previewUrl: string;
		imageFocusX: number;
		imageFocusY: number;
		error?: string;
		onFileChange: (file: File | undefined) => void;
	}

	let {
		mode,
		previewUrl,
		imageFocusX = $bindable(),
		imageFocusY = $bindable(),
		error = '',
		onFileChange
	}: Props = $props();

	function handleChange(event: Event) {
		onFileChange((event.currentTarget as HTMLInputElement).files?.[0]);
	}
</script>

<div id="image-picker-section" tabindex="-1" class="space-y-5 focus:outline-none">
	<div>
		<h2 class="wizard-heading" tabindex="-1">
			{previewUrl ? 'Välj utsnitt' : 'Börja med en bild'}
		</h2>
		<p class="mt-1 text-slate-600">
			{previewUrl ? 'Bilden blir kortet i flödet.' : 'Få med baren. Bilden blir kortet i flödet.'}
		</p>
	</div>

	<input
		type="file"
		name="image"
		id="image"
		class="sr-only"
		accept={REVIEW_IMAGE_ACCEPT}
		aria-invalid={error ? true : undefined}
		aria-describedby={error ? 'image-error' : undefined}
		onchange={handleChange}
	/>
	<input type="hidden" name="imageFocusX" value={imageFocusX.toFixed(2)} />
	<input type="hidden" name="imageFocusY" value={imageFocusY.toFixed(2)} />

	{#if previewUrl}
		<PhotoCropper src={previewUrl} bind:focusX={imageFocusX} bind:focusY={imageFocusY} />
		<label for="image" class="btn btn-secondary w-full">
			<ImagePlus class="size-4" aria-hidden="true" />
			{mode === 'edit' ? 'Byt bild' : 'Välj en annan bild'}
		</label>
	{:else}
		<label
			for="image"
			class="empty-frame relative mx-auto flex aspect-square w-full max-w-[min(100%,50vh)] cursor-pointer items-center justify-center rounded-3xl bg-slate-900/5 transition-colors hover:bg-slate-900/8 {error
				? 'ring-2 ring-red-500'
				: ''}"
		>
			<span class="frame-corner top-3 left-3 rounded-tl-3xl border-t-4 border-l-4"></span>
			<span class="frame-corner top-3 right-3 rounded-tr-3xl border-t-4 border-r-4"></span>
			<span class="frame-corner bottom-3 left-3 rounded-bl-3xl border-b-4 border-l-4"></span>
			<span class="frame-corner right-3 bottom-3 rounded-br-3xl border-r-4 border-b-4"></span>
			<Beer class="size-16 text-slate-900/15" aria-hidden="true" />
		</label>
		<label for="image" class="btn btn-primary min-h-12 w-full text-base">
			<ImagePlus class="size-5" aria-hidden="true" />
			Välj bild
		</label>
		<p class="field-help text-center">
			På mobilen kan du ta ett foto direkt. {REVIEW_IMAGE_ALLOWED_TYPES_LABEL}.
		</p>
	{/if}

	{#if error}
		<p id="image-error" class="field-error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.frame-corner {
		position: absolute;
		width: 3rem;
		height: 3rem;
		border-color: var(--color-amber-600);
	}

	/* The file input is visually hidden; its labels show its keyboard focus. */
	input[type='file']:focus-visible ~ label {
		outline: 2px solid var(--color-sky-500);
		outline-offset: 2px;
	}
</style>
