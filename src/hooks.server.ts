import { start_mongo } from '$lib/db/db';
import { lucia } from '$lib/server/auth';
import { authenticateApiRequest, isApiPath } from '$lib/server/api/auth';
import type { Handle, RequestEvent } from '@sveltejs/kit';

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

export const handle: Handle = async ({ event, resolve }) => {
	// The API accepts only bearer tokens and never reads or writes the session cookie.
	const { user, session } = isApiPath(event.url.pathname)
		? await authenticateApiRequest(event.request.headers.get('authorization'), (token) =>
				lucia.validateSession(token)
			)
		: await authenticateWebRequest(event);

	event.locals.user = user;
	event.locals.session = session;

	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');

	return response;
};
