import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getBrowserPreferences,
	onPreferencesChange,
	parseAnalyticsConsent,
	parseLocationEnabled,
	setAnalyticsConsent,
	setLocationEnabled
} from './preferences';

afterEach(() => vi.unstubAllGlobals());

const browser = (protocol = 'https:') => {
	const cookies = new Map<string, string>();
	const writes: string[] = [];
	vi.stubGlobal('document', {
		get cookie() {
			return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		},
		set cookie(value: string) {
			writes.push(value);
			const [name, entry] = value.split(';')[0].split('=');
			cookies.set(name, entry);
		}
	});
	const browserWindow = Object.assign(new EventTarget(), { location: { protocol }, gtag: vi.fn() });
	vi.stubGlobal('window', browserWindow);
	return { writes, cookies, browserWindow };
};

describe('browser preferences', () => {
	it('defaults missing location to enabled and malformed location to disabled', () => {
		for (const value of [undefined, null, 'true']) expect(parseLocationEnabled(value)).toBe(true);
		for (const value of ['', 'false', 'TRUE', 'true-extra'])
			expect(parseLocationEnabled(value)).toBe(false);
		for (const value of [undefined, '', 'granted-extra'])
			expect(parseAnalyticsConsent(value)).toBe('unset');
		expect(parseAnalyticsConsent('granted')).toBe('granted');
		expect(parseAnalyticsConsent('denied')).toBe('denied');
	});

	it('persists only preference choices and disposes browser notifications', () => {
		const { writes } = browser();
		const listener = vi.fn();
		const stop = onPreferencesChange(listener);
		setLocationEnabled(false);
		expect(getBrowserPreferences()).toEqual({ locationEnabled: false, analyticsConsent: 'unset' });
		expect(writes[0]).toBe(
			'location_enabled=false; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
		);
		expect(listener).toHaveBeenCalledOnce();
		stop();
		setLocationEnabled(true);
		expect(listener).toHaveBeenCalledOnce();
	});

	it('updates analytics consent while keeping all advertising storage denied', () => {
		const { browserWindow, writes } = browser('http:');
		const listener = vi.fn();
		onPreferencesChange(listener);
		for (const consent of ['granted', 'denied'] as const) {
			setAnalyticsConsent(consent);
			expect(getBrowserPreferences().analyticsConsent).toBe(consent);
			expect(browserWindow.gtag).toHaveBeenLastCalledWith('consent', 'update', {
				analytics_storage: consent,
				ad_storage: 'denied',
				ad_user_data: 'denied',
				ad_personalization: 'denied'
			});
		}
		expect(writes.every((value) => !value.includes('Secure'))).toBe(true);
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it('saves consent and notifies listeners even if analytics is blocked or unavailable', () => {
		const { browserWindow } = browser();
		const listener = vi.fn();
		onPreferencesChange(listener);
		vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { protocol: 'https:' } }));
		expect(() => setAnalyticsConsent('granted')).not.toThrow();
		vi.stubGlobal('window', browserWindow);
		browserWindow.gtag.mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(() => setAnalyticsConsent('denied')).not.toThrow();
		expect(getBrowserPreferences().analyticsConsent).toBe('denied');
		expect(listener).toHaveBeenCalledOnce();
	});

	it('reads each cookie exactly and treats malformed values conservatively', () => {
		browser();
		document.cookie = 'other_location_enabled=true';
		document.cookie = 'location_enabled=true-extra';
		document.cookie = 'analytics_consent=granted-extra';
		expect(getBrowserPreferences()).toEqual({ locationEnabled: false, analyticsConsent: 'unset' });
	});
});
