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
				class="relative aspect-[16/9] w-full touch-none overflow-hidden rounded-2xl border border-white/85 bg-white/85 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_85%,transparent)] focus:outline-none focus:ring-2 focus:ring-sky-200"
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
