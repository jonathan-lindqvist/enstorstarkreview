<script lang="ts">
	import { onDestroy } from 'svelte';
	import { REVIEW_IMAGE_ACCEPT } from '$lib/constants';
	import { validateImageFile, clampImageFocus } from '$lib/utils/review-image';
	interface Props {
		hasError: (field: string) => boolean;
		getFieldErrorMessage: (field: string, fallback: string) => string;
		mode: 'create' | 'edit';
		existingImage?: string;
		imageFocusX: number;
		imageFocusY: number;
		clientImageError: string;
	}
	let {
		hasError,
		getFieldErrorMessage,
		mode,
		existingImage,
		imageFocusX = $bindable(),
		imageFocusY = $bindable(),
		clientImageError = $bindable()
	}: Props = $props();
	let selectedImagePreview = $state('');
	let imageInput = $state<HTMLInputElement | null>(null);
	let imagePreviewFrame = $state<HTMLButtonElement | null>(null);
	let objectUrlToRevoke = '';

	const currentImagePreview = $derived.by(() => {
		if (selectedImagePreview) return selectedImagePreview;
		if (!existingImage) return '';
		if (
			existingImage.startsWith('http://') ||
			existingImage.startsWith('https://') ||
			existingImage.startsWith('/')
		) {
			return existingImage;
		}
		return `/images/${existingImage}`;
	});

	onDestroy(() => {
		if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
	});
	function openImagePicker() {
		imageInput?.click();
	}

	function handleImageChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		clientImageError = validateImageFile(file, mode === 'create');

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
</script>

<div id="image-picker-section" class="mt-6" tabindex="-1">
	<label for="image" class="field-label mb-2">
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
			class="btn btn-secondary min-h-12 w-full {hasError('image')
				? 'border-red-500! ring-2 ring-red-100'
				: ''}"
		>
			{currentImagePreview ? 'Byt bild' : 'Välj bild'}
		</button>

		{#if currentImagePreview}
			<button
				bind:this={imagePreviewFrame}
				type="button"
				class="relative aspect-[16/9] w-full cursor-crosshair touch-none overflow-hidden rounded-2xl bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
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
					class="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow-[0_2px_8px_color-mix(in_oklab,var(--color-slate-950)_35%,transparent)]"
					style={`left: ${imageFocusX}%; top: ${imageFocusY}%`}
				></span>
			</button>
		{/if}
	</div>

	{#if hasError('image')}
		<p class="field-error mt-2">
			{getFieldErrorMessage('image', 'Välj en bildfil')}
		</p>
	{/if}
</div>
