import { readFileSync, statSync } from 'node:fs';
import { expect, it } from 'vitest';
import sharp from 'sharp';

it('declares the Swedish document language', () => {
	const template = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
	expect(template).toContain('<html lang="sv"');
});

it('ships a navigation logo smaller than 20 KB', () => {
	const navbar = readFileSync(new URL('../lib/components/Navbar.svelte', import.meta.url), 'utf8');
	const filename = navbar.match(/<img\b[^>]*\bsrc="\/([^"?]+)"/)?.[1];
	expect(filename).toBeTruthy();
	expect(statSync(new URL(`../../static/${filename}`, import.meta.url)).size).toBeLessThan(20000);
});

it('ships compact, transparent mugs with lossless pixels at every supported density', async () => {
	for (const rating of [1, 2, 3]) {
		const original = new URL(`../../static/rating-glass/${rating}.png`, import.meta.url);
		for (const width of [128, 256, 512, 768]) {
			const path = new URL(`../../static/rating-glass/${rating}-${width}.webp`, import.meta.url);
			const metadata = await sharp(readFileSync(path)).metadata();
			expect(metadata).toMatchObject({ width, height: width, hasAlpha: true, format: 'webp' });
			// Lossless WebP may normalize RGB under fully transparent pixels.
			// Compare the visible artwork on both backgrounds, including the white keyline.
			const resized = await sharp(readFileSync(original)).resize(width).png().toBuffer();
			for (const background of ['black', 'white']) {
				const actual = await sharp(readFileSync(path)).flatten({ background }).raw().toBuffer();
				const expected = await sharp(resized).flatten({ background }).raw().toBuffer();
				expect(actual.equals(expected)).toBe(true);
			}
			if (width === 128) expect(statSync(path).size).toBeLessThan(15000);
		}
	}
});
