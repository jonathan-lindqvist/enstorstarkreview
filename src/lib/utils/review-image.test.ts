import { describe, expect, it } from 'vitest';
import { getReviewImageSources } from './review-image';

describe('review image sources', () => {
	it('exposes bounded responsive candidates while retaining a separate original URL', () => {
		const filename = '6a1e9d487d43112acf4a0c36.png';
		const sources = getReviewImageSources(filename, 'photo-768-v2', '/default.png');
		expect(sources.initial).toBe(`/images/${filename}?preview=photo-768-v2`);
		expect(sources.original).toBe(`/images/${filename}`);
		expect(sources.srcset?.split(', ')).toHaveLength(5);
		expect(sources.srcset).toContain(`?preview=photo-480-v2 480w`);
		expect(sources.srcset).toContain(`?preview=photo-2560-v2 2560w`);
		expect(sources.srcset).not.toContain(`${sources.original} `);
	});
	it('uses a versioned preview and preserves the original URL', () => {
		const filename = '6a1e9d487d43112acf4a0c36.png';
		expect(getReviewImageSources(filename, 'card-v1', '/default.png')).toEqual({
			initial: `/images/${filename}?preview=card-v1`,
			original: `/images/${filename}`
		});
	});

	it.each([
		'blob:local-photo',
		'https://example.com/photo.png',
		'/images/photo.png',
		'/default.png'
	])('preserves %s without creating a server preview request', (image) => {
		expect(getReviewImageSources(image, 'card-v1', '/default.png')).toEqual({
			initial: image,
			original: image
		});
	});

	it('preserves the bundled fallback for missing photos', () => {
		expect(getReviewImageSources(undefined, 'card-v1', '/default.png')).toEqual({
			initial: '/default.png',
			original: '/default.png'
		});
	});
});
