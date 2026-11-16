import { describe, expect, it } from 'vitest';
import {
	getReviewImageDimensions,
	getReviewImageSizes,
	getReviewImageSources
} from './review-image';

describe('review photo layout sizes', () => {
	it('scales every layout slot for the landscape cover crop', () => {
		expect(
			getReviewImageSizes('(min-width: 1000px) 500px, calc(100vw - 32px)', {
				width: 1200,
				height: 800
			})
		).toBe('(min-width: 1000px) calc(500px * 1.5), calc(calc(100vw - 32px) * 1.5)');
	});
	it.each([
		undefined,
		null,
		{},
		{ width: 0, height: 100 },
		{ width: 1.2, height: 1 },
		{ width: '1200', height: 800 },
		{ width: Infinity, height: 800 },
		{ width: 800, height: 1200 },
		{ width: 800, height: 800 }
	])('keeps layout slots for portrait, square, missing or invalid dimensions: %j', (dimensions) => {
		expect(getReviewImageSizes('300px', dimensions)).toBe('300px');
	});
	it('rejects invalid stored dimensions without inventing a size', () => {
		expect(getReviewImageDimensions({ width: 0, height: 200 })).toBeUndefined();
		expect(getReviewImageDimensions({ width: 1200, height: 800 })).toEqual({
			width: 1200,
			height: 800
		});
	});
});

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
