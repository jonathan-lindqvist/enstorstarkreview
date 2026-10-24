import { parseTheme, THEME_COOKIE } from '#lib/theme.js';
import {
	ANALYTICS_COOKIE,
	LOCATION_COOKIE,
	parseAnalyticsConsent,
	parseLocationEnabled
} from '#lib/preferences.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	return {
		analyticsConsent: parseAnalyticsConsent(cookies.get(ANALYTICS_COOKIE)),
		locationEnabled: parseLocationEnabled(cookies.get(LOCATION_COOKIE)),
		theme: parseTheme(cookies.get(THEME_COOKIE)),
		user: locals.user ? { username: locals.user.username } : null
	};
};
