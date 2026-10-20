import { readFileSync, statSync } from 'node:fs';
import { expect, it } from 'vitest';

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
