import { Effect } from 'effect';
import type { Session } from 'lucia';
import type { User } from '$lib/types/user';
import { audit, type AuditEventInput } from '$lib/server/audit';
import { Sessions } from '$lib/server/auth';
import { InvalidCredentials, RateLimited } from '$lib/server/errors';
import { LoginRateLimiter } from '$lib/server/rate-limit';
import { RequestContext } from '$lib/server/request';
import { verifyLoginCredentials } from './credentials';

export type LoginChannel = 'web' | 'api';

const RATE_LIMITED_MESSAGE = 'För många inloggningsförsök, försök igen senare';

/** A server-owned admission, never read from a client request. */
export interface LoginIpAdmission {
	readonly ip: string;
}

/** The API admits before reading JSON; the web form admits inside `loginWithPassword`. */
export const admitLoginIp = Effect.fn('admitLoginIp')(function* (
	channel: LoginChannel,
	username?: string
) {
	const { ip } = yield* RequestContext;
	const limit = yield* LoginRateLimiter.use((limiter) => limiter.consume('ip', ip));
	if (limit.allowed) return { ip } satisfies LoginIpAdmission;
	yield* audit({
		eventType: 'login_attempt',
		outcome: 'rate_limited',
		username,
		ip,
		reason: 'ip_limit_exceeded',
		details: {
			retryAfterSeconds: limit.retryAfterSeconds,
			...(channel === 'api' ? { channel: 'api' } : {})
		}
	});
	return yield* new RateLimited({
		message: RATE_LIMITED_MESSAGE,
		retryAfterSeconds: limit.retryAfterSeconds
	});
});

/**
 * Password login shared by the web form and the API. The order is deliberate: both rate limits
 * are consumed before any credential check, and a success clears only the username limit. API
 * events carry `details.channel` so they can be told apart in the audit log.
 */
export const loginWithPassword = Effect.fn('loginWithPassword')(function* (
	input: { username: unknown; password: unknown; channel: LoginChannel },
	options: { ipAdmission?: LoginIpAdmission } = {}
) {
	const { ip } = yield* RequestContext;
	const limiter = yield* LoginRateLimiter;
	const { channel } = input;
	const username = typeof input.username === 'string' ? input.username : null;
	const usernameKey = username?.trim().toLowerCase() ?? '';
	const channelDetails = channel === 'api' ? { channel } : undefined;
	const auditLogin = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip'>) =>
		audit({
			eventType: 'login_attempt',
			username: usernameKey,
			ip,
			...event,
			...(event.details || channelDetails
				? { details: { ...event.details, ...channelDetails } }
				: {})
		});

	if (options.ipAdmission?.ip !== ip) yield* admitLoginIp(channel, usernameKey);

	const limit = yield* limiter.consume('username', usernameKey);
	if (!limit.allowed) {
		yield* auditLogin({
			outcome: 'rate_limited',
			reason: 'username_limit_exceeded',
			details: { retryAfterSeconds: limit.retryAfterSeconds }
		});
		return yield* new RateLimited({
			message: RATE_LIMITED_MESSAGE,
			retryAfterSeconds: limit.retryAfterSeconds
		});
	}

	const credentials = yield* verifyLoginCredentials(username, input.password);
	if (!credentials.ok) {
		yield* auditLogin({ outcome: 'failure', reason: credentials.reason });
		return yield* new InvalidCredentials({ message: credentials.message });
	}

	yield* limiter.clear('username', usernameKey);
	const session = yield* Sessions.use((sessions) => sessions.create(credentials.user._id));
	yield* auditLogin({ outcome: 'success' });
	return { user: credentials.user as User, session: session as Session };
});
