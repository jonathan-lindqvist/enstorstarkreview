import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEER_BRANDS, BEER_BRAND_OPTIONS, beerBrandImage } from './beer-brands';

const STATIC_DIR = new URL('../../static', import.meta.url).pathname;

describe('beerBrandImage', () => {
	it('points every listed brand at a logo file in static/', () => {
		for (const brand of BEER_BRANDS) {
			const src = beerBrandImage(brand);
			expect(src && existsSync(`${STATIC_DIR}${src}`), `${brand} -> ${src}`).toBe(true);
		}
	});

	it('returns null for custom, empty, and inherited-property names', () => {
		expect(beerBrandImage('Annan öl')).toBeNull();
		expect(beerBrandImage('')).toBeNull();
		expect(beerBrandImage('__proto__')).toBeNull();
		expect(beerBrandImage('toString')).toBeNull();
	});

	it('ships no unused images', () => {
		const used = new Set<string>(BEER_BRAND_OPTIONS.map(({ image }) => image));
		const files = readdirSync(`${STATIC_DIR}/beer-brands`);
		expect(files.filter((file) => !used.has(file))).toEqual([]);
	});
});
