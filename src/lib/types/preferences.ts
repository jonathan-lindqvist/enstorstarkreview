export type AnalyticsConsent = 'unset' | 'granted' | 'denied';

export interface BrowserPreferences {
	locationEnabled: boolean;
	analyticsConsent: AnalyticsConsent;
}
