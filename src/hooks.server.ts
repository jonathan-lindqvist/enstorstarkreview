import { Effect } from 'effect';
import { Sessions } from '$lib/server/auth';
import { appRuntime } from '$lib/server/platform/runtime';
import { parseTheme, THEME_COOKIE } from '$lib/theme';
import { ANALYTICS_COOKIE, parseAnalyticsConsent } from '$lib/preferences';
import type { Handle, RequestEvent } from '@sveltejs/kit';

const API_PATH_PREFIX = '/api/';

// Build the runtime at boot, so MongoDB connects and creates its indexes before the first request.
appRuntime.runPromise(Effect.void).catch((error) => console.error(error));

/** Validates the session cookie and refreshes or clears it, for web routes only. */
const authenticateWebRequest = (event: RequestEvent) =>
	appRuntime.runPromise(
		Effect.gen(function* () {
			const sessions = yield* Sessions;
			const sessionId = event.cookies.get(sessions.sessionCookieName);
			if (!sessionId) return { user: null, session: null };

			const { user, session } = yield* sessions.validate(sessionId);
			const cookie = !session
				? sessions.blankSessionCookie()
				: session.fresh
					? sessions.sessionCookie(session.id)
					: null;
			if (cookie) event.cookies.set(cookie.name, cookie.value, { path: '.', ...cookie.attributes });
			return { user, session };
		})
	);

export const handle: Handle = async ({ event, resolve }) => {
	// The API authenticates bearer tokens itself (server/api/handlers.ts) and never reads or
	// writes the session cookie.
	const { user, session } = event.url.pathname.startsWith(API_PATH_PREFIX)
		? { user: null, session: null }
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
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');

	return response;
};
