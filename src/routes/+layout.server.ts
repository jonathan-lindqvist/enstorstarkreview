import { parseTheme, THEME_COOKIE } from '$lib/theme';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	const analyticsConsent = cookies.get('analytics_consent');
	const consent =
		analyticsConsent === 'granted' || analyticsConsent === 'denied' ? analyticsConsent : 'unset';

	return {
		analyticsConsent: consent,
		theme: parseTheme(cookies.get(THEME_COOKIE)),
		user: locals.user ? { username: locals.user.username } : null
	};
};
