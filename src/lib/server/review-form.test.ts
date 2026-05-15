import { describe, expect, it } from 'vitest';
import {
	getImageExtension,
	hasInvalidRatingValues,
	isDuplicateSlugError,
	matchesImageSignature,
	normalizeCoAuthors,
	sanitizeLongText,
	sanitizePlainText,
	sanitizeSlug
} from './review-form';

describe('review-form helpers', () => {
	it('sanitizePlainText removes control chars and normalizes whitespace', () => {
		expect(sanitizePlainText('  Foo\u0000\n\tBar   Baz  ')).toBe('Foo Bar Baz');
	});

	it('sanitizeLongText removes control chars but keeps line breaks', () => {
		expect(sanitizeLongText('\u0000Line 1\nLine 2\n')).toBe('Line 1\nLine 2');
	});

	it('sanitizeSlug keeps letters, digits, accents, and hyphens', () => {
		expect(sanitizeSlug('  Café åäö ! test---slug  ')).toBe('Café-åäö-test-slug');
	});

	it('normalizeCoAuthors deduplicates, trims, and excludes current user', () => {
		const values = [
			' sara ',
			'bob',
			'sara',
			'current',
			'',
			'   ',
			123 as unknown as FormDataEntryValue
		];
		expect(normalizeCoAuthors(values, 'current')).toEqual(['sara', 'bob']);
	});

	it('hasInvalidRatingValues validates 0..5 and rejects NaN', () => {
		expect(hasInvalidRatingValues([0, 1, 2, 3, 4, 5, 2.5])).toBe(false);
		expect(hasInvalidRatingValues([0, 6])).toBe(true);
		expect(hasInvalidRatingValues([-1, 2])).toBe(true);
		expect(hasInvalidRatingValues([Number.NaN, 2])).toBe(true);
	});

	it('getImageExtension returns extension for allowed mime types', () => {
		expect(getImageExtension('image/jpeg')).toBe('jpg');
		expect(getImageExtension('image/png')).toBe('png');
		expect(getImageExtension('application/pdf')).toBeUndefined();
	});

	it('matchesImageSignature validates jpeg/png/webp/gif magic bytes', () => {
		expect(matchesImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(
			true
		);
		expect(
			matchesImageSignature(
				new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
				'image/png'
			)
		).toBe(true);

		const riffWebp = new Uint8Array([
			0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
		]);
		expect(matchesImageSignature(riffWebp, 'image/webp')).toBe(true);
		expect(
			matchesImageSignature(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif')
		).toBe(true);
		expect(matchesImageSignature(new Uint8Array([0x00, 0x01, 0x02]), 'image/jpeg')).toBe(false);
	});

	it('isDuplicateSlugError identifies mongodb duplicate key errors', () => {
		expect(isDuplicateSlugError({ code: 11000 })).toBe(true);
		expect(isDuplicateSlugError({ code: 12345 })).toBe(false);
		expect(isDuplicateSlugError(null)).toBe(false);
	});
});
