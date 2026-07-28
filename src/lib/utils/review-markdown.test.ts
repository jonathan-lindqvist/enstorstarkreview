import { describe, expect, it } from 'vitest';
import { renderReviewMarkdown } from './review-markdown';

describe('renderReviewMarkdown', () => {
	it('renders headings, emphasis, and both list types', () => {
		const html = renderReviewMarkdown(`## Helhetsintryck

En **minnesvärd** och *livlig* bar.

- Första punkten
- Andra punkten

1. Första steget
2. Andra steget`);

		expect(html).toContain('<h2>Helhetsintryck</h2>');
		expect(html).toContain('<strong>minnesvärd</strong>');
		expect(html).toContain('<em>livlig</em>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<ol>');
		expect(html).toContain('<li>Första punkten</li>');
		expect(html).toContain('<li>Andra steget</li>');
	});

	it('preserves single line breaks from existing descriptions', () => {
		const html = renderReviewMarkdown('Första raden\nAndra raden');

		expect(html).toBe('<p>Första raden<br>\nAndra raden</p>\n');
	});

	it('renders raw HTML and unsafe links as text', () => {
		const html = renderReviewMarkdown(
			'<script>alert("inte säkert")</script>\n\n[Klicka här](javascript:alert("inte säkert"))'
		);

		expect(html).toContain('&lt;script&gt;alert(&quot;inte säkert&quot;)&lt;/script&gt;');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('href=');
	});
});
