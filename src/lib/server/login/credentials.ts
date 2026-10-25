import { hash, verify } from 'argon2';
import { Context, Effect, Layer } from 'effect';
import type { User } from '$lib/types/user';
import type { MongoError } from '$lib/server/platform/mongo';
import { UserStore } from '$lib/server/users';
import {
	ARGON2_OPTIONS,
	USERNAME_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH
} from './policy.js';

/** Argon2 with the policy shared with `scripts/create-user.js`. */
export class PasswordHasher extends Context.Service<
	PasswordHasher,
	{
		hash(password: string): Effect.Effect<void>;
		verify(storedHash: string, password: string): Effect.Effect<boolean>;
	}
>()('enstorstark/login/PasswordHasher') {
	static readonly layer = Layer.succeed(
		PasswordHasher,
		PasswordHasher.of({
			hash: (password) => Effect.promise(() => hash(password, ARGON2_OPTIONS)).pipe(Effect.asVoid),
			verify: (storedHash, password) => Effect.promise(() => verify(storedHash, password))
		})
	);
}

export type CredentialResult =
	| { ok: true; user: User }
	| {
			ok: false;
			reason:
				| 'invalid_username_format'
				| 'invalid_password_format'
				| 'unknown_username'
				| 'password_mismatch';
			message: string;
	  };

/**
 * Verifies a username and password. Unknown usernames still pay for an Argon2 hash, so response
 * time does not reveal which accounts exist. Storage failures propagate as errors and are never
 * reported as wrong credentials.
 */
export const verifyLoginCredentials = (
	username: unknown,
	password: unknown
): Effect.Effect<CredentialResult, MongoError, UserStore | PasswordHasher> =>
	Effect.gen(function* () {
		if (
			typeof username !== 'string' ||
			username.length < USERNAME_MIN_LENGTH ||
			username.length > USERNAME_MAX_LENGTH ||
			!/^[a-z0-9_-]+$/.test(username)
		) {
			return {
				ok: false,
				reason: 'invalid_username_format',
				message: 'Ogiltigt användarnamn eller lösenord'
			} as const;
		}
		if (
			typeof password !== 'string' ||
			password.length < PASSWORD_MIN_LENGTH ||
			password.length > PASSWORD_MAX_LENGTH
		) {
			return {
				ok: false,
				reason: 'invalid_password_format',
				message: 'Ogiltigt användarnamn eller lösenord'
			} as const;
		}
		const hasher = yield* PasswordHasher;
		const user = yield* UserStore.use((users) => users.findByUsername(username.toLowerCase()));
		if (!user) {
			yield* hasher.hash(password);
			return {
				ok: false,
				reason: 'unknown_username',
				message: 'Fel användarnamn eller lösenord'
			} as const;
		}
		if (!(yield* hasher.verify(user.password, password))) {
			return {
				ok: false,
				reason: 'password_mismatch',
				message: 'Fel användarnamn eller lösenord'
			} as const;
		}
		return { ok: true, user } as const;
	});
