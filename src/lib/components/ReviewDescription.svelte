<script lang="ts">
	import { renderReviewMarkdown } from '$lib/utils/review-markdown';

	interface Props {
		description: string;
		variant?: 'full' | 'preview';
	}

	let { description, variant = 'full' }: Props = $props();
	const html = $derived(renderReviewMarkdown(description));
</script>

<div
	class:review-description--full={variant === 'full'}
	class:review-description--preview={variant === 'preview'}
	class="review-description text-sm leading-relaxed text-slate-700 sm:text-base"
	data-testid={variant === 'preview' ? 'review-description-preview' : 'review-description'}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- MarkdownIt escapes raw HTML before this is rendered. -->
	{@html html}
	{#if variant === 'preview'}
		<div class="review-description__fade" aria-hidden="true"></div>
	{/if}
</div>

<style>
	.review-description {
		position: relative;
	}

	.review-description :global(h1),
	.review-description :global(h2),
	.review-description :global(h3) {
		margin: 0;
		color: var(--color-slate-900);
	}

	.review-description--full :global(h1) {
		font-size: 1.5rem;
	}

	.review-description--full :global(h2) {
		font-size: 1.25rem;
	}

	.review-description--full :global(h3) {
		font-size: 1.125rem;
	}

	.review-description :global(h1 + *),
	.review-description :global(h2 + *),
	.review-description :global(h3 + *) {
		margin-top: 0.5rem;
	}

	.review-description :global(p) {
		margin: 0;
	}

	.review-description :global(p + p),
	.review-description :global(p + ul),
	.review-description :global(p + ol),
	.review-description :global(ul + p),
	.review-description :global(ol + p) {
		margin-top: 0.75rem;
	}

	.review-description :global(ul),
	.review-description :global(ol) {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
	}

	.review-description :global(ul) {
		list-style: disc;
	}

	.review-description :global(ol) {
		list-style: decimal;
	}

	.review-description--preview {
		height: 5rem;
		overflow: hidden;
	}

	.review-description--preview :global(h1),
	.review-description--preview :global(h2),
	.review-description--preview :global(h3) {
		font-family: inherit;
		font-size: inherit;
		font-weight: 600;
		line-height: inherit;
	}

	.review-description--preview :global(ul),
	.review-description--preview :global(ol) {
		margin-top: 0.25rem;
	}

	.review-description__fade {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 1.75rem;
		pointer-events: none;
		background: linear-gradient(to bottom, rgb(255 255 255 / 0), rgb(255 255 255 / 0.9));
	}
</style>
