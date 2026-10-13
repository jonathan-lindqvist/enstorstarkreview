<script lang="ts">
	import defaultImage from '$lib/images/image.png';
	import { getReviewImageSources } from '$lib/utils/review-image';
	import type { ReviewImagePreview } from '$lib/types/review-image';
	import { upgradeReviewImage } from '$lib/client/review-image-loading';

	interface Props {
		image?: string;
		alt: string;
		preview?: ReviewImagePreview;
		imageFocusX?: number;
		imageFocusY?: number;
		loading?: 'eager' | 'lazy';
		fetchpriority?: 'high' | 'low' | 'auto';
		class?: string;
	}

	let {
		image,
		alt,
		preview = 'card-v1',
		imageFocusX = 50,
		imageFocusY = 50,
		loading = 'lazy',
		fetchpriority = 'auto',
		class: imageClass = ''
	}: Props = $props();
	let element = $state<HTMLImageElement | null>(null);
	const sources = $derived(getReviewImageSources(image, preview, defaultImage));
	$effect(() => {
		if (element) return upgradeReviewImage(element, sources.original);
	});
</script>

<img
	bind:this={element}
	src={sources.initial}
	{alt}
	{loading}
	{fetchpriority}
	decoding="async"
	class={`block aspect-square object-cover ${imageClass}`}
	style={`object-position: ${imageFocusX ?? 50}% ${imageFocusY ?? 50}%`}
/>
