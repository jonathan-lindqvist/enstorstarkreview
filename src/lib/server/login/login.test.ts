import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { AuditLog, type AuditEventInput } from '$lib/server/audit';
import { MongoError } from '$lib/server/platform/mongo';
import { LoginRateLimiter, type LoginRateLimitResult } from '$lib/server/rate-limit';
import { RequestContext } from '$lib/server/request';
import { failureOf, sessionsTestLayer } from '$lib/server/testing';
import { UserStore } from '$lib/server/users';
import { PasswordHasher } from './credentials';
import { admitLoginIp, loginWithPassword } from './login';

const ip = '203.0.113.30';
const input = { username: 'editor', password: 'testpass123', channel: 'web' as const };
const user = { _id: 'user-id', username: 'editor', password: 'stored-hash' };
const allowed: LoginRateLimitResult = { allowed: true, remainingAttempts: 7, retryAfterSeconds: 0 };

const setup = () => {
	const calls: string[] = [];
	const audits: AuditEventInput[] = [];
	const consume = vi.fn((scope: string, key: string) => {
		calls.push(`consume ${scope} ${key}`);
		return Effect.succeed<LoginRateLimitResult>(allowed) as Effect.Effect<
			LoginRateLimitResult,
			MongoError
		>;
	});
	const clear = vi.fn((scope: string, key: string) =>
		Effect.sync(() => void calls.push(`clear ${scope} ${key}`))
	);
	const verify = vi.fn(() =>
		Effect.sync(() => {
			calls.push('verify');
			return true;
		})
	);
	const layer = Layer.mergeAll(
		Layer.succeed(LoginRateLimiter, LoginRateLimiter.of({ consume, clear })),
		Layer.succeed(
			UserStore,
			UserStore.of({
				findByUsername: () => Effect.succeed(user),
				existingUsernames: () => Effect.succeed([]),
				listUsernames: () => Effect.succeed([]),
				listAuthorOptions: () => Effect.succeed([])
			})
		),
		Layer.succeed(PasswordHasher, PasswordHasher.of({ hash: () => Effect.void, verify })),
		Layer.succeed(
			AuditLog,
			AuditLog.of({ log: (event) => Effect.sync(() => void audits.push(event)) })
		),
		sessionsTestLayer({}),
		Layer.succeed(RequestContext, RequestContext.of({ ip }))
	);
	const run = <A, E>(
		effect: Effect.Effect<
			A,
			E,
			| LoginRateLimiter
			| UserStore
			| PasswordHasher
			| AuditLog
			| RequestContext
			| import('$lib/server/auth').Sessions
		>
	) => Effect.runPromiseExit(Effect.provide(effect, layer));
	return { calls, audits, consume, verify, run };
};

describe('shared login quota admission', () => {
	it('keeps web login IP then username order and clears only the username on success', async () => {
		const { calls, run } = setup();
		const exit = await run(loginWithPassword(input));
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(calls).toEqual([
			`consume ip ${ip}`,
			'consume username editor',
			'verify',
			'clear username editor'
		]);
	});

	it('reuses an API admission for the same IP without charging twice', async () => {
		const { consume, audits, run } = setup();
		const admission = await run(admitLoginIp('api'));
		if (!Exit.isSuccess(admission)) throw new Error('Expected admission');
		await run(loginWithPassword({ ...input, channel: 'api' }, { ipAdmission: admission.value }));
		expect(consume.mock.calls).toEqual([
			['ip', ip],
			['username', 'editor']
		]);
		expect(audits).toContainEqual(
			expect.objectContaining({ outcome: 'success', details: { channel: 'api' } })
		);
	});

	it('cannot reuse another IP admission to skip the current IP quota', async () => {
		const { consume, verify, run } = setup();
		consume.mockReturnValueOnce(
			Effect.succeed({ allowed: false, remainingAttempts: 0, retryAfterSeconds: 90 })
		);
		const exit = await run(loginWithPassword(input, { ipAdmission: { ip: 'other-ip' } }));
		expect(failureOf(exit)).toMatchObject({ _tag: 'RateLimited', retryAfterSeconds: 90 });
		expect(consume).toHaveBeenCalledExactlyOnceWith('ip', ip);
		expect(verify).not.toHaveBeenCalled();
	});

	it('propagates a username limiter failure without verifying credentials or creating a session', async () => {
		const { consume, verify, run } = setup();
		consume
			.mockReturnValueOnce(Effect.succeed(allowed))
			.mockReturnValueOnce(Effect.fail(new MongoError({ cause: new Error('unavailable') })));
		const exit = await run(loginWithPassword(input));
		expect(failureOf(exit)).toMatchObject({ _tag: 'MongoError' });
		expect(verify).not.toHaveBeenCalled();
	});

	it('rejects wrong credentials with an audited failure', async () => {
		const { verify, audits, run } = setup();
		verify.mockReturnValueOnce(Effect.succeed(false));
		const exit = await run(loginWithPassword(input));
		expect(failureOf(exit)).toMatchObject({
			_tag: 'InvalidCredentials',
			message: 'Fel användarnamn eller lösenord'
		});
		expect(audits.at(-1)).toMatchObject({ outcome: 'failure', reason: 'password_mismatch' });
	});
});
