<script lang="ts">
	interface Props {
		rating: number;
		class?: string;
		decorative?: boolean;
	}

	let { rating, class: imageClass = '', decorative = false }: Props = $props();
</script>

{#if rating > 0}
	<img
		src={`/rating-glass/${rating}.png`}
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
