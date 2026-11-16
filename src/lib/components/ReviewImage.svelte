<script lang="ts">
	import defaultImage from '$lib/images/image.png';
	import { getReviewImageSources } from '$lib/utils/review-image';
	import type { ReviewImagePreview } from '$lib/types/review-image';
	import { prepareReviewImage } from '$lib/client/review-image-loading';
	import { CARD_IMAGE_SIZES } from '$lib/review-image-previews';

	interface Props {
		image?: string;
		alt: string;
		preview?: ReviewImagePreview;
		sizes?: string;
		imageFocusX?: number;
		imageFocusY?: number;
		loading?: 'eager' | 'lazy';
		fetchpriority?: 'high' | 'low' | 'auto';
		class?: string;
	}

	let {
		image,
		alt,
		preview = 'photo-768-v2',
		sizes = CARD_IMAGE_SIZES,
		imageFocusX = 50,
		imageFocusY = 50,
		loading = 'lazy',
		fetchpriority = 'auto',
		class: imageClass = ''
	}: Props = $props();
	let element = $state<HTMLImageElement | null>(null);
	const sources = $derived(getReviewImageSources(image, preview, defaultImage));
	$effect(() => {
		if (element) return prepareReviewImage(element, sources.original);
	});
</script>

<img
	bind:this={element}
	src={sources.initial}
	srcset={sources.srcset}
	sizes={sources.srcset ? sizes : undefined}
	{alt}
	{loading}
	{fetchpriority}
	decoding="async"
	class={`block aspect-square object-cover ${imageClass}`}
	style={`object-position: ${imageFocusX ?? 50}% ${imageFocusY ?? 50}%`}
/>
