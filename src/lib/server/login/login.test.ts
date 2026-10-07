import { describe, expect, it, vi } from 'vitest';
import { admitLoginIp, loginWithPassword, type LoginDependencies } from './login';

const ip = '203.0.113.30';
const input = { username: 'editor', password: 'testpass123', ip, channel: 'web' as const };
const user = { _id: 'user-id', username: 'editor', password: 'stored-hash' };
const dependencies = () => ({
	consumeRateLimit: vi.fn<LoginDependencies<string>['consumeRateLimit']>().mockResolvedValue({
		allowed: true,
		remainingAttempts: 7,
		retryAfterSeconds: 0
	}),
	clearRateLimit: vi.fn<LoginDependencies<string>['clearRateLimit']>().mockResolvedValue(),
	verifyCredentials: vi
		.fn<LoginDependencies<string>['verifyCredentials']>()
		.mockResolvedValue({ ok: true, user }),
	createSession: vi
		.fn<LoginDependencies<string>['createSession']>()
		.mockResolvedValue('session-id'),
	audit: vi.fn<LoginDependencies<string>['audit']>().mockResolvedValue()
});

describe('shared login quota admission', () => {
	it('keeps web login IP then username order and clears only the username on success', async () => {
		const deps = dependencies();
		expect((await loginWithPassword(input, deps)).ok).toBe(true);
		expect(deps.consumeRateLimit.mock.calls).toEqual([
			['ip', ip],
			['username', 'editor']
		]);
		expect(deps.consumeRateLimit.mock.invocationCallOrder[1]).toBeLessThan(
			deps.verifyCredentials.mock.invocationCallOrder[0]
		);
		expect(deps.clearRateLimit).toHaveBeenCalledExactlyOnceWith('username', 'editor');
		expect(deps.createSession).toHaveBeenCalledExactlyOnceWith(user);
	});

	it('reuses an API admission for the same IP without charging twice', async () => {
		const deps = dependencies();
		const admission = await admitLoginIp({ ip, channel: 'api' }, deps);
		if (!admission.ok) throw new Error('Expected admission');
		await loginWithPassword({ ...input, channel: 'api' }, deps, { ipAdmission: admission });
		expect(deps.consumeRateLimit.mock.calls).toEqual([
			['ip', ip],
			['username', 'editor']
		]);
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: 'success', details: { channel: 'api' } })
		);
	});

	it('cannot reuse another IP admission to skip the current IP quota', async () => {
		const deps = dependencies();
		deps.consumeRateLimit.mockResolvedValueOnce({
			allowed: false,
			remainingAttempts: 0,
			retryAfterSeconds: 90
		});
		const result = await loginWithPassword(input, deps, {
			ipAdmission: { ok: true, ip: 'other-ip' }
		});
		expect(result).toMatchObject({ ok: false, kind: 'rate_limited', retryAfterSeconds: 90 });
		expect(deps.consumeRateLimit).toHaveBeenCalledExactlyOnceWith('ip', ip);
		expect(deps.verifyCredentials).not.toHaveBeenCalled();
		expect(deps.createSession).not.toHaveBeenCalled();
	});

	it('propagates a username limiter failure without verifying credentials or creating a session', async () => {
		const deps = dependencies();
		deps.consumeRateLimit
			.mockResolvedValueOnce({ allowed: true, remainingAttempts: 7, retryAfterSeconds: 0 })
			.mockRejectedValueOnce(new Error('unavailable'));
		await expect(loginWithPassword(input, deps)).rejects.toThrow('unavailable');
		expect(deps.verifyCredentials).not.toHaveBeenCalled();
		expect(deps.createSession).not.toHaveBeenCalled();
	});
});
