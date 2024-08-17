import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { verify, hash } from '@node-rs/argon2';
import { users } from '$lib/db/users';
import { lucia } from '$lib/server/auth';

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = formData.get('username');
		const password = formData.get('password');

		if (
			typeof username !== 'string' ||
			username.length < 3 ||
			username.length > 31 ||
			!/^[a-z0-9_-]+$/.test(username)
		) {
			return fail(400, {
				message: 'Invalid username or password'
			});
		}

		if (typeof password !== 'string' || password.length < 6 || password.length > 255) {
			return fail(400, {
				message: 'Invalid username or password'
			});
		}

		const existingUser = await users.findOne({ username: username.toLowerCase() });

		if (!existingUser) {
			await hash(password, {
				memoryCost: 19456,
				timeCost: 2,
				outputLen: 32,
				parallelism: 1
			});

			return fail(400, { message: 'Incorrect username or password' });
		}

		const validPassword = await verify(existingUser.password, password, {
			memoryCost: 19456,
			timeCost: 2,
			outputLen: 32,
			parallelism: 1
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
