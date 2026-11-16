<script lang="ts">
	interface Props {
		rating: number;
		class?: string;
		decorative?: boolean;
		sizes?: string;
	}

	let { rating, class: imageClass = '', decorative = false, sizes = '40px' }: Props = $props();
</script>

{#if rating > 0}
	<img
		src={`/rating-glass/${rating}-128.webp`}
		srcset={[128, 256, 512, 768]
			.map((width) => `/rating-glass/${rating}-${width}.webp ${width}w`)
			.join(', ')}
		{sizes}
		alt={decorative ? '' : `Helhetsbetyg ${rating} av 3`}
		aria-hidden={decorative ? true : undefined}
		draggable="false"
		width="384"
		height="384"
		class={`block aspect-square shrink-0 object-contain ${imageClass}`}
	/>
{:else if !decorative}
	<span class="sr-only">Helhetsbetyg 0 av 3</span>
{/if}
