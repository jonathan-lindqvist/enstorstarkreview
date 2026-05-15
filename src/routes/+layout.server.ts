import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	const analyticsConsent = cookies.get('analytics_consent');
	const consent =
		analyticsConsent === 'granted' || analyticsConsent === 'denied' ? analyticsConsent : 'unset';

	return {
		analyticsConsent: consent,
		user: locals.user ? { username: locals.user.username } : null
	};
};
