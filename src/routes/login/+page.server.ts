import { verifyLoginCredentials } from '$lib/server/login/credentials';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verify, hash } from 'argon2';
import { users } from '$lib/db/users';
import { lucia } from '$lib/server/auth';
import { consumeLoginRateLimit, clearLoginRateLimit } from '$lib/server/rate-limit';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';

const credentialDependencies = {
	findUser: (username: string) => users.findOne({ username }),
	hash,
	verify
};

export const actions: Actions = {
	login: async (event) => {
		const { request, cookies } = event;
		const ip = getRequestIp(event);

		const formData = await request.formData();
		const username = formData.get('username');
		const password = formData.get('password');
		const usernameKey = typeof username === 'string' ? username.trim().toLowerCase() : '';

		const ipLimit = await consumeLoginRateLimit('ip', ip);
		if (!ipLimit.allowed) {
			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'rate_limited',
				username: usernameKey,
				ip,
				reason: 'ip_limit_exceeded',
				details: { retryAfterSeconds: ipLimit.retryAfterSeconds }
			});

			return fail(429, { message: 'För många inloggningsförsök, försök igen senare' });
		}

		const usernameLimit = await consumeLoginRateLimit('username', usernameKey);
		if (!usernameLimit.allowed) {
			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'rate_limited',
				username: usernameKey,
				ip,
				reason: 'username_limit_exceeded',
				details: { retryAfterSeconds: usernameLimit.retryAfterSeconds }
			});

			return fail(429, { message: 'För många inloggningsförsök, försök igen senare' });
		}

		const credentials = await verifyLoginCredentials(username, password, credentialDependencies);
		if (!credentials.ok) {
			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'failure',
				username: usernameKey,
				ip,
				reason: credentials.reason
			});
			return fail(400, { message: credentials.message });
		}
		const existingUser = credentials.user;

		await clearLoginRateLimit('username', usernameKey);

		const session = await lucia.createSession(existingUser._id, {});
		const sessionCookie = await lucia.createSessionCookie(session.id);

		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		await logAuditEvent({
			eventType: 'login_attempt',
			outcome: 'success',
			username: usernameKey,
			ip
		});

		throw redirect(302, '/admin/reviews');
	}
};
