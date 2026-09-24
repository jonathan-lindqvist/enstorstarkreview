import { sanitizeLongText, sanitizePlainText } from '$lib/utils/review-text';
import { describe, expect, it } from 'vitest';

describe('text', () => {
	it('sanitizePlainText removes control chars and normalizes whitespace', () => {
		expect(sanitizePlainText('  Foo\u0000\n\tBar   Baz  ')).toBe('Foo Bar Baz');
	});

	it('sanitizeLongText removes control chars but keeps line breaks', () => {
		expect(sanitizeLongText('\u0000Line 1\nLine 2\n')).toBe('Line 1\nLine 2');
	});
});
