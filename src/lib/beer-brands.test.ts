import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEER_BRANDS, BEER_BRAND_IMAGES, beerBrandImage } from './beer-brands';

const STATIC_DIR = new URL('../../static', import.meta.url).pathname;

describe('beerBrandImage', () => {
	it('points every listed brand image at a file in static/', () => {
		for (const brand of BEER_BRANDS) {
			const src = beerBrandImage(brand);
			if (src) expect(existsSync(`${STATIC_DIR}${src}`), `${brand} -> ${src}`).toBe(true);
		}
	});

	it('has an image for every listed brand', () => {
		expect(BEER_BRANDS.filter((brand) => !beerBrandImage(brand))).toEqual([]);
	});

	it('returns null for custom, empty, and inherited-property names', () => {
		expect(beerBrandImage('Annan öl')).toBeNull();
		expect(beerBrandImage('')).toBeNull();
		expect(beerBrandImage('__proto__')).toBeNull();
		expect(beerBrandImage('toString')).toBeNull();
	});

	it('ships no unused images', () => {
		const used = new Set(Object.values(BEER_BRAND_IMAGES));
		const files = readdirSync(`${STATIC_DIR}/beer-brands`).map((file) => `/beer-brands/${file}`);
		expect(files.filter((file) => !used.has(file))).toEqual([]);
	});
});
