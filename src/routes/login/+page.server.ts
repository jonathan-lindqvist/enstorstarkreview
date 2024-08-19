import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verify, hash } from '@node-rs/argon2';
import { users } from '$lib/db/users';
import { lucia } from '$lib/server/auth';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 31;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 255;
const ARGON2_MEMORY_COST = 19456;
const ARGON2_TIME_COST = 2;
const ARGON2_OUTPUT_LEN = 32;
const ARGON2_PARALLELISM = 1;

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = formData.get('username');
		const password = formData.get('password');

		if (
			typeof username !== 'string' ||
			username.length < USERNAME_MIN_LENGTH ||
			username.length > USERNAME_MAX_LENGTH ||
			!/^[a-z0-9_-]+$/.test(username)
		) {
			return fail(400, {
				message: 'Invalid username or password'
			});
		}

		if (
			typeof password !== 'string' ||
			password.length < PASSWORD_MIN_LENGTH ||
			password.length > PASSWORD_MAX_LENGTH
		) {
			return fail(400, {
				message: 'Invalid username or password'
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

			return fail(400, { message: 'Incorrect username or password' });
		}

		const validPassword = await verify(existingUser.password, password, {
			memoryCost: ARGON2_MEMORY_COST,
			timeCost: ARGON2_TIME_COST,
			outputLen: ARGON2_OUTPUT_LEN,
			parallelism: ARGON2_PARALLELISM
		});

		if (!validPassword) {
			return fail(400, { message: 'Incorrect username or password' });
		}

		const session = await lucia.createSession(existingUser._id, {});
		const sessionCookie = await lucia.createSessionCookie(session.id);

		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		redirect(302, '/admin');
	}
};
