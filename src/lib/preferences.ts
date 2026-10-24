import type { AnalyticsConsent, BrowserPreferences } from '#lib/types/preferences.js';

export const LOCATION_COOKIE = 'location_enabled';
export const ANALYTICS_COOKIE = 'analytics_consent';
const PREFERENCES_CHANGE_EVENT = 'preferenceschange';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const parseLocationEnabled = (value: string | null | undefined): boolean =>
	value == null || value === 'true';

export const parseAnalyticsConsent = (value: string | null | undefined): AnalyticsConsent =>
	value === 'granted' || value === 'denied' ? value : 'unset';

const readCookie = (name: string): string | undefined =>
	globalThis.document?.cookie
		.split(';')
		.map((cookie) => cookie.trim())
		.find((cookie) => cookie.startsWith(`${name}=`))
		?.slice(name.length + 1);

export const getBrowserPreferences = (): BrowserPreferences => ({
	locationEnabled: parseLocationEnabled(readCookie(LOCATION_COOKIE)),
	analyticsConsent: parseAnalyticsConsent(readCookie(ANALYTICS_COOKIE))
});

const saveCookie = (name: string, value: string): void => {
	const secure = window.location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${name}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
};

const notifyPreferencesChange = (): void => {
	window.dispatchEvent(new Event(PREFERENCES_CHANGE_EVENT));
};

export const onPreferencesChange = (listener: () => void): (() => void) => {
	globalThis.window?.addEventListener(PREFERENCES_CHANGE_EVENT, listener);
	return () => globalThis.window?.removeEventListener(PREFERENCES_CHANGE_EVENT, listener);
};

export const setLocationEnabled = (enabled: boolean): void => {
	saveCookie(LOCATION_COOKIE, String(enabled));
	notifyPreferencesChange();
};

export const setAnalyticsConsent = (consent: Exclude<AnalyticsConsent, 'unset'>): void => {
	saveCookie(ANALYTICS_COOKIE, consent);
	const gtag = (window as Window & { gtag?: (...parameters: unknown[]) => void }).gtag;
	try {
		gtag?.('consent', 'update', {
			analytics_storage: consent,
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied'
		});
	} catch {
		// Blocking analytics must not prevent saving a visitor's preference.
	}
	notifyPreferencesChange();
};
