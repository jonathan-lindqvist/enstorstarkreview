import { describe, expect, it } from 'vitest';
import { generateSlug } from './slug';

describe('generateSlug', () => {
	it('converts Swedish characters to ascii', () => {
		expect(generateSlug('Öl på Ångbåten')).toBe('ol-pa-angbaten');
	});

	it('removes special characters and collapses separators', () => {
		expect(generateSlug('  Hello,   world___bar!!  ')).toBe('hello-world-bar');
	});

	it('returns an empty string for input with only separators', () => {
		expect(generateSlug('___   ---')).toBe('');
	});
});
