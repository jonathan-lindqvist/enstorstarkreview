import { start_mongo } from '#lib/db/db.js';
import { lucia } from '#lib/server/auth.js';
import { authenticateApiRequest, isApiPath } from '#lib/server/api/auth.js';
import { parseTheme, THEME_COOKIE } from '#lib/theme.js';
import { ANALYTICS_COOKIE, parseAnalyticsConsent } from '#lib/preferences.js';
import type { Handle } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import { isForbiddenWebOrigin } from '#lib/server/request-origin.js';

start_mongo()
	.then(() => {
		console.log('Mongo started');
	})
	.catch((error) => {
		console.error(error);
	});

const authenticateWebRequest = async (event: RequestEvent) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName);
	let session = null;
	let user = null;

	if (sessionId) {
		const validation = await lucia.validateSession(sessionId);
		session = validation.session;
		user = validation.user;

		if (session && session.fresh) {
			const sessionCookie = lucia.createSessionCookie(session.id);
			event.cookies.set(sessionCookie.name, sessionCookie.value, {
				path: '.',
				...sessionCookie.attributes
			});
		}
		if (!session) {
			const sessionCookie = lucia.createBlankSessionCookie();
			event.cookies.set(sessionCookie.name, sessionCookie.value, {
				path: '.',
				...sessionCookie.attributes
			});
		}
	}

	return { user, session };
};

const withSecurityHeaders = (response: Response): Response => {
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');
	return response;
};

export const handle: Handle = async ({ event, resolve }) => {
	if (!dev && isForbiddenWebOrigin(event.request, event.url)) {
		const message = 'Förfrågan kunde inte verifieras.';
		const response =
			event.request.headers.get('accept') === 'application/json'
				? Response.json({ message }, { status: 403 })
				: new Response(message, { status: 403 });
		return withSecurityHeaders(response);
	}
	// The API accepts only bearer tokens and never reads or writes the session cookie.
	const { user, session } = isApiPath(event.url.pathname)
		? await authenticateApiRequest(event.request.headers.get('authorization'), (token) =>
				lucia.validateSession(token)
			)
		: await authenticateWebRequest(event);

	event.locals.user = user;
	event.locals.session = session;

	// Render the saved theme into <html> so the first paint already uses it.
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	const analyticsConsent = parseAnalyticsConsent(event.cookies.get(ANALYTICS_COOKIE));
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%app.theme%', theme)
				.replace('%app.analyticsConsent%', analyticsConsent === 'granted' ? 'granted' : 'denied')
	});
	return withSecurityHeaders(response);
};
