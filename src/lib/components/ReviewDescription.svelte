<script lang="ts">
	import { renderReviewMarkdown } from '$lib/utils/review-markdown';

	interface Props {
		description: string;
		variant?: 'full' | 'preview';
		tone?: 'default' | 'photo';
	}

	let { description, variant = 'full', tone = 'default' }: Props = $props();
	const html = $derived(renderReviewMarkdown(description));
</script>

<div
	class:review-description--full={variant === 'full'}
	class:review-description--preview={variant === 'preview'}
	class:review-description--photo={tone === 'photo'}
	class={[
		'review-description text-sm leading-relaxed',
		tone === 'photo' ? 'text-on-photo/90' : 'text-slate-700 sm:text-base'
	]}
	data-testid={variant === 'preview' ? 'review-description-preview' : 'review-description'}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- MarkdownIt escapes raw HTML before this is rendered. -->
	{@html html}
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
		/* Fade the text itself so the cut-off works on any card background or theme. */
		mask-image: linear-gradient(to bottom, #000 calc(100% - 1.75rem), transparent);
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

	.review-description--photo {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		height: auto;
		max-height: 3em;
		line-height: 1.5;
		mask-image: none;
	}

	.review-description--photo :global(h1),
	.review-description--photo :global(h2),
	.review-description--photo :global(h3),
	.review-description--photo :global(p) {
		display: inline;
		margin: 0;
		color: inherit;
	}

	.review-description--photo :global(h1),
	.review-description--photo :global(h2),
	.review-description--photo :global(h3) {
		margin-inline-end: 0.25rem;
	}

	@container (width < 20rem) {
		.review-description--photo {
			-webkit-line-clamp: 1;
			line-clamp: 1;
			max-height: 1.5em;
		}
	}
</style>
