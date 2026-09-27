import { hash, verify } from 'argon2';
import type { Session } from 'lucia';
import { users } from '$lib/db/users';
import { lucia } from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/audit';
import { clearLoginRateLimit, consumeLoginRateLimit } from '$lib/server/rate-limit';
import { verifyLoginCredentials } from './credentials';
import type { LoginDependencies } from './login';

const credentialDependencies = {
	findUser: (username: string) => users.findOne({ username }),
	hash,
	verify
};

export const loginDependencies: LoginDependencies<Session> = {
	consumeRateLimit: consumeLoginRateLimit,
	clearRateLimit: clearLoginRateLimit,
	verifyCredentials: (username, password) =>
		verifyLoginCredentials(username, password, credentialDependencies),
	createSession: (user) => lucia.createSession(user._id, {}),
	audit: logAuditEvent
};
