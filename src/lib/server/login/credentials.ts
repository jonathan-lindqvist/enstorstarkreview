import type { User } from '$lib/types/user';
import {
	ARGON2_OPTIONS,
	USERNAME_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH
} from './policy.js';

interface CredentialDependencies {
	findUser(username: string): Promise<User | null>;
	hash(password: string, options: typeof ARGON2_OPTIONS): Promise<unknown>;
	verify(hash: string, password: string): Promise<boolean>;
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

export const verifyLoginCredentials = async (
	username: FormDataEntryValue | null,
	password: FormDataEntryValue | null,
	deps: CredentialDependencies
): Promise<CredentialResult> => {
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
		};
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
		};
	}
	const user = await deps.findUser(username.toLowerCase());
	if (!user) {
		await deps.hash(password, ARGON2_OPTIONS);
		return { ok: false, reason: 'unknown_username', message: 'Fel användarnamn eller lösenord' };
	}
	if (!(await deps.verify(user.password, password))) {
		return { ok: false, reason: 'password_mismatch', message: 'Fel användarnamn eller lösenord' };
	}
	return { ok: true, user };
};
