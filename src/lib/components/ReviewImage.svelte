<script lang="ts">
	import defaultImage from '$lib/images/image.png';
	import {
		getReviewImageDimensions,
		getReviewImageSizes,
		getReviewImageSources
	} from '$lib/utils/review-image';
	import type { ReviewImageDimensions, ReviewImagePreview } from '$lib/types/review-image';
	import { prepareReviewImage } from '$lib/client/review-image-loading';

	interface Props {
		image?: string;
		alt: string;
		preview?: ReviewImagePreview;
		sizes: string;
		imageDimensions?: ReviewImageDimensions;
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
		sizes,
		imageDimensions,
		imageFocusX = 50,
		imageFocusY = 50,
		loading = 'lazy',
		fetchpriority = 'auto',
		class: imageClass = ''
	}: Props = $props();
	let element = $state<HTMLImageElement | null>(null);
	let decoded = $state<{ source: string; dimensions: ReviewImageDimensions }>();
	let failedSource = $state<string>();
	const sources = $derived(getReviewImageSources(image, preview, defaultImage));
	const dimensions = $derived(
		getReviewImageDimensions(imageDimensions) ??
			(decoded?.source === sources.initial ? decoded.dimensions : undefined)
	);
	const selectedSizes = $derived(getReviewImageSizes(sizes, dimensions));
	const useOriginal = $derived(failedSource === sources.initial);
	$effect(() => {
		const source = sources.initial;
		if (!element || source === sources.original) return;
		return prepareReviewImage(element, {
			loaded: (dimensions) => {
				if (!getReviewImageDimensions(imageDimensions)) decoded = { source, dimensions };
			},
			failed: () => (failedSource = source)
		});
	});
</script>

<img
	bind:this={element}
	srcset={useOriginal ? undefined : sources.srcset}
	sizes={!useOriginal && sources.srcset ? selectedSizes : undefined}
	src={useOriginal ? sources.original : sources.initial}
	{alt}
	{loading}
	{fetchpriority}
	decoding="async"
	class={`block aspect-square object-cover ${imageClass}`}
	style={`object-position: ${imageFocusX ?? 50}% ${imageFocusY ?? 50}%`}
/>
