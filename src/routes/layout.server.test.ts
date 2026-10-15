import { describe, expect, it } from 'vitest';
import { load } from './+layout.server';

const loadPreferences = (cookies: Record<string, string> = {}) =>
	load({
		cookies: { get: (name: string) => cookies[name] },
		locals: { user: null }
	} as unknown as Parameters<typeof load>[0]);

describe('server-rendered visitor preferences', () => {
	it('returns public browser defaults', async () => {
		expect(await loadPreferences()).toEqual({
			locationEnabled: true,
			analyticsConsent: 'unset',
			theme: 'light',
			user: null
		});
	});

	it('uses saved settings and rejects malformed preference values', async () => {
		expect(
			await loadPreferences({
				location_enabled: 'false',
				analytics_consent: 'denied',
				theme: 'dark'
			})
		).toMatchObject({ locationEnabled: false, analyticsConsent: 'denied', theme: 'dark' });
		expect(
			await loadPreferences({
				location_enabled: 'unknown',
				analytics_consent: 'granted-extra',
				theme: 'system'
			})
		).toMatchObject({ locationEnabled: false, analyticsConsent: 'unset', theme: 'light' });
	});
});
