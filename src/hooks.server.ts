import { start_mongo } from '$lib/db/db';
import { lucia } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

start_mongo()
	.then(() => {
		console.log('Mongo started');
	})
	.catch((error) => {
		console.error(error);
	});

export const handle: Handle = async ({ event, resolve }) => {
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

	event.locals.user = user;
	event.locals.session = session;

	// Generate a nonce for CSP
	const nonce = crypto.randomUUID();

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%sveltekit.nonce%', nonce)
	});

	response.headers.set(
		'Content-Security-Policy',
		`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'nonce-${nonce}' 'sha256-KIAfKba93AUIodW6DohpNO/LjbHHh/7Tm+l15BBWKE4='; script-src-elem 'self' 'nonce-${nonce}' 'sha256-KIAfKba93AUIodW6DohpNO/LjbHHh/7Tm+l15BBWKE4='; script-src-attr 'unsafe-inline'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
	);
	return response;
};
