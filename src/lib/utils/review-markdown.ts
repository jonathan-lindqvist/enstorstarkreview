import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({
	html: false,
	breaks: true,
	linkify: false,
	typographer: false
});

// Cards are links themselves, so links and images are intentionally not part of review Markdown.
// This keeps the supported formatting focused and prevents nested interactive content or remote media.
markdown.disable(['autolink', 'image', 'link']);

export const renderReviewMarkdown = (description: string): string => markdown.render(description);
