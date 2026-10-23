<script lang="ts">
	interface Props {
		rating: number;
		class?: string;
		decorative?: boolean;
	}

	let { rating, class: imageClass = '', decorative = false }: Props = $props();
</script>

<img
	src={`/rating-glass/${rating}.png`}
	alt={decorative ? '' : `Helhetsbetyg ${rating} av 3`}
	aria-hidden={decorative ? true : undefined}
	width="384"
	height="384"
	class={`block aspect-square shrink-0 object-contain ${imageClass}`}
/>
