import type { AuditEventInput } from '$lib/server/audit';
import type { LoginRateLimitResult } from '$lib/server/rate-limit';
import type { User } from '$lib/types/user';
import type { CredentialResult } from './credentials';

export type LoginChannel = 'web' | 'api';

export interface LoginDependencies<TSession> {
	consumeRateLimit(scope: 'ip' | 'username', key: string): Promise<LoginRateLimitResult>;
	clearRateLimit(scope: 'username', key: string): Promise<void>;
	verifyCredentials(
		username: FormDataEntryValue | null,
		password: FormDataEntryValue | null
	): Promise<CredentialResult>;
	createSession(user: User): Promise<TSession>;
	audit(event: AuditEventInput): Promise<void>;
}

export type LoginResult<TSession> =
	| { ok: true; user: User; session: TSession }
	| { ok: false; kind: 'rate_limited'; message: string; retryAfterSeconds: number }
	| { ok: false; kind: 'invalid_credentials'; message: string };

const RATE_LIMITED_MESSAGE = 'För många inloggningsförsök, försök igen senare';

/**
 * Password login shared by the web form and the API. The order is deliberate: both rate
 * limits are consumed before any credential check, and a success clears only the username
 * limit. API events carry `details.channel` so they can be told apart in the audit log.
 */
export const loginWithPassword = async <TSession>(
	input: { username: unknown; password: unknown; ip: string; channel: LoginChannel },
	deps: LoginDependencies<TSession>
): Promise<LoginResult<TSession>> => {
	const { ip, channel } = input;
	const username = typeof input.username === 'string' ? input.username : null;
	const password = typeof input.password === 'string' ? input.password : null;
	const usernameKey = username?.trim().toLowerCase() ?? '';
	const channelDetails = channel === 'api' ? { channel } : undefined;
	const audit = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip'>) =>
		deps.audit({
			eventType: 'login_attempt',
			username: usernameKey,
			ip,
			...event,
			...(event.details || channelDetails
				? { details: { ...event.details, ...channelDetails } }
				: {})
		});

	for (const scope of ['ip', 'username'] as const) {
		const limit = await deps.consumeRateLimit(scope, scope === 'ip' ? ip : usernameKey);
		if (!limit.allowed) {
			await audit({
				outcome: 'rate_limited',
				reason: `${scope}_limit_exceeded`,
				details: { retryAfterSeconds: limit.retryAfterSeconds }
			});
			return {
				ok: false,
				kind: 'rate_limited',
				message: RATE_LIMITED_MESSAGE,
				retryAfterSeconds: limit.retryAfterSeconds
			};
		}
	}

	const credentials = await deps.verifyCredentials(username, password);
	if (!credentials.ok) {
		await audit({ outcome: 'failure', reason: credentials.reason });
		return { ok: false, kind: 'invalid_credentials', message: credentials.message };
	}

	await deps.clearRateLimit('username', usernameKey);
	const session = await deps.createSession(credentials.user);
	await audit({ outcome: 'success' });

	return { ok: true, user: credentials.user, session };
};
