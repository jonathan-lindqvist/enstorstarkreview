import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { lucia } from '$lib/server/auth';
import { isProcedureError } from '$lib/server/rpc/errors';
import { webClient } from '$lib/server/rpc/web';

const formText = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '');

export const actions: Actions = {
	login: async (event) => {
		const { request, cookies } = event;
		const formData = await request.formData();

		let session;
		try {
			session = await webClient(event).sessions.create({
				body: {
					username: formText(formData.get('username')),
					password: formText(formData.get('password'))
				}
			});
		} catch (cause) {
			if (!isProcedureError(cause)) throw cause;
			// The web form answers wrong credentials with 400, unlike the API's 401.
			return fail(cause.code === 'rate_limited' ? 429 : 400, { message: cause.message });
		}

		// The API returns the session as a bearer token; the web keeps it in the session cookie.
		const sessionCookie = lucia.createSessionCookie(session.token);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		throw redirect(302, '/admin/reviews');
	}
};
