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

/** A server-owned admission, never read from a client request. */
export interface LoginIpAdmission {
	ok: true;
	ip: string;
}

/** The API calls this before reading JSON; web login admits after parsing its form. */
export const admitLoginIp = async (
	context: { ip: string; channel: LoginChannel; username?: string },
	deps: Pick<LoginDependencies<unknown>, 'consumeRateLimit' | 'audit'>
): Promise<LoginIpAdmission | Extract<LoginResult<never>, { kind: 'rate_limited' }>> => {
	const limit = await deps.consumeRateLimit('ip', context.ip);
	if (limit.allowed) return { ok: true, ip: context.ip };
	await deps.audit({
		eventType: 'login_attempt',
		outcome: 'rate_limited',
		username: context.username,
		ip: context.ip,
		reason: 'ip_limit_exceeded',
		details: {
			retryAfterSeconds: limit.retryAfterSeconds,
			...(context.channel === 'api' ? { channel: 'api' } : {})
		}
	});
	return {
		ok: false,
		kind: 'rate_limited',
		message: RATE_LIMITED_MESSAGE,
		retryAfterSeconds: limit.retryAfterSeconds
	};
};

/**
 * Password login shared by the web form and the API. The order is deliberate: both rate
 * limits are consumed before any credential check, and a success clears only the username
 * limit. API events carry `details.channel` so they can be told apart in the audit log.
 */
export const loginWithPassword = async <TSession>(
	input: { username: unknown; password: unknown; ip: string; channel: LoginChannel },
	deps: LoginDependencies<TSession>,
	options: { ipAdmission?: LoginIpAdmission } = {}
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

	if (options.ipAdmission?.ip !== ip) {
		const admission = await admitLoginIp({ ip, channel, username: usernameKey }, deps);
		if (!admission.ok) return admission;
	}
	const limit = await deps.consumeRateLimit('username', usernameKey);
	if (!limit.allowed) {
		await audit({
			outcome: 'rate_limited',
			reason: 'username_limit_exceeded',
			details: { retryAfterSeconds: limit.retryAfterSeconds }
		});
		return {
			ok: false,
			kind: 'rate_limited',
			message: RATE_LIMITED_MESSAGE,
			retryAfterSeconds: limit.retryAfterSeconds
		};
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
