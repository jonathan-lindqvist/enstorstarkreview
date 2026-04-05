import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verify, hash } from '@node-rs/argon2';
import { users } from '$lib/db/users';
import { lucia } from '$lib/server/auth';
import { consumeLoginRateLimit, clearLoginRateLimit } from '$lib/server/rate-limit';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 31;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 255;
const ARGON2_MEMORY_COST = 19456;
const ARGON2_TIME_COST = 2;
const ARGON2_OUTPUT_LEN = 32;
const ARGON2_PARALLELISM = 1;

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

		if (
			typeof username !== 'string' ||
			username.length < USERNAME_MIN_LENGTH ||
			username.length > USERNAME_MAX_LENGTH ||
			!/^[a-z0-9_-]+$/.test(username)
		) {
			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'failure',
				username: usernameKey,
				ip,
				reason: 'invalid_username_format'
			});

			return fail(400, {
				message: 'Ogiltigt användarnamn eller lösenord'
			});
		}

		if (
			typeof password !== 'string' ||
			password.length < PASSWORD_MIN_LENGTH ||
			password.length > PASSWORD_MAX_LENGTH
		) {
			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'failure',
				username: usernameKey,
				ip,
				reason: 'invalid_password_format'
			});

			return fail(400, {
				message: 'Ogiltigt användarnamn eller lösenord'
			});
		}

		const existingUser = await users.findOne({ username: username.toLowerCase() });

		if (!existingUser) {
			await hash(password, {
				memoryCost: ARGON2_MEMORY_COST,
				timeCost: ARGON2_TIME_COST,
				outputLen: ARGON2_OUTPUT_LEN,
				parallelism: ARGON2_PARALLELISM
			});

			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'failure',
				username: usernameKey,
				ip,
				reason: 'unknown_username'
			});

			return fail(400, { message: 'Fel användarnamn eller lösenord' });
		}

		const validPassword = await verify(existingUser.password, password, {
			memoryCost: ARGON2_MEMORY_COST,
			timeCost: ARGON2_TIME_COST,
			outputLen: ARGON2_OUTPUT_LEN,
			parallelism: ARGON2_PARALLELISM
		});

		if (!validPassword) {
			await logAuditEvent({
				eventType: 'login_attempt',
				outcome: 'failure',
				username: usernameKey,
				ip,
				reason: 'password_mismatch'
			});

			return fail(400, { message: 'Fel användarnamn eller lösenord' });
		}

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
