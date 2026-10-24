import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { lucia } from '#lib/server/auth.js';
import { getRequestIp } from '#lib/server/request.js';
import { loginWithPassword } from '#lib/server/login/login.js';
import { loginDependencies } from '#lib/server/login/production.js';

export const actions: Actions = {
	login: async (event) => {
		const { request, cookies } = event;
		const formData = await request.formData();

		const result = await loginWithPassword(
			{
				username: formData.get('username'),
				password: formData.get('password'),
				ip: getRequestIp(event),
				channel: 'web'
			},
			loginDependencies
		);

		if (!result.ok) {
			return fail(result.kind === 'rate_limited' ? 429 : 400, { message: result.message });
		}

		const sessionCookie = lucia.createSessionCookie(result.session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		throw redirect(302, '/admin/reviews');
	}
};
