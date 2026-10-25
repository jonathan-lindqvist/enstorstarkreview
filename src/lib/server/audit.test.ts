import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mongo } from '$lib/server/platform/mongo';
import { audit, AuditLog, type AuditEventInput } from './audit';

const mocks = { insertOne: vi.fn() };
const logAuditEvent = (event: AuditEventInput) =>
	Effect.runPromise(
		audit(event).pipe(
			Effect.provide(AuditLog.layer),
			Effect.provide(Mongo.layerTest({ auditLogs: { insertOne: mocks.insertOne } as never }))
		)
	);

describe('logAuditEvent', () => {
	beforeEach(() => {
		mocks.insertOne.mockReset();
	});

	it('writes normalized audit entries', async () => {
		mocks.insertOne.mockResolvedValueOnce({ acknowledged: true });

		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'attempt',
			username: '  alice  ',
			ip: '  203.0.113.7  ',
			targetSlug: '  slug  ',
			targetId: '  123  ',
			reason: '  test  ',
			details: { foo: 'bar' }
		});

		expect(mocks.insertOne).toHaveBeenCalledTimes(1);
		const payload = mocks.insertOne.mock.calls[0][0];
		expect(payload.eventType).toBe('review_edit');
		expect(payload.outcome).toBe('attempt');
		expect(payload.username).toBe('alice');
		expect(payload.ip).toBe('203.0.113.7');
		expect(payload.targetSlug).toBe('slug');
		expect(payload.targetId).toBe('123');
		expect(payload.reason).toBe('test');
		expect(payload.details).toEqual({ foo: 'bar' });
		expect(payload.createdAt).toBeInstanceOf(Date);
	});

	it('swallows insert errors and logs to console', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.insertOne.mockRejectedValueOnce(new Error('insert failed'));

		await expect(
			logAuditEvent({ eventType: 'login_attempt', outcome: 'failure', username: '', ip: '' })
		).resolves.toBeUndefined();

		expect(consoleSpy).toHaveBeenCalledWith('Audit log insert failed:', expect.any(Error));
		consoleSpy.mockRestore();
	});
});
