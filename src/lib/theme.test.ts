import { describe, expect, it } from 'vitest';
import { parseTheme } from './theme';

describe('parseTheme', () => {
	it('honours a saved dark choice', () => {
		expect(parseTheme('dark')).toBe('dark');
	});

	it('defaults to light for missing, light, or unknown values', () => {
		expect(parseTheme(undefined)).toBe('light');
		expect(parseTheme(null)).toBe('light');
		expect(parseTheme('')).toBe('light');
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('system')).toBe('light');
		expect(parseTheme('"><script>')).toBe('light');
	});
});
