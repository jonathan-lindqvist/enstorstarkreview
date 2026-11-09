import { describe, expect, it, vi } from 'vitest';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import type { PushDevice } from '$lib/types/push-device';
import { announcePublishedReview, type AnnounceDependencies, type PushSender } from './announce';

const device = (
	token: string,
	platform: PushDevice['platform'],
	username?: string
): PushDevice => ({
	token,
	platform,
	...(platform === 'ios' ? { apnsEnvironment: 'production' as const } : {}),
	...(username ? { username } : {}),
	createdAt: new Date(0),
	updatedAt: new Date(0)
});

const sender = (report = { delivered: 0, failed: 0, invalidTokens: [] as string[] }) => ({
	send: vi.fn<PushSender['send']>(async (devices) => ({
		...report,
		delivered: report.delivered || devices.length
	}))
});

const createDependencies = (devices: PushDevice[]) => {
	const apns = sender();
	const fcm = sender();
	const deps = {
		findRecipients: vi.fn(async () => devices),
		removeDevices: vi.fn(async () => {}),
		senders: { apns, fcm } as AnnounceDependencies['senders'],
		audit: vi.fn(async () => {})
	};
	return { deps, apns, fcm };
};

const review = createExistingReview({
	title: 'Bar Himmel',
	slug: 'bar-himmel',
	author: 'alice',
	coAuthors: ['carol', ' ', 'alice']
});

describe('announcing a published review', () => {
	it('leaves out every credited reviewer and the publisher', async () => {
		const { deps } = createDependencies([]);
		await announcePublishedReview(review, 'bob', deps);
		expect(deps.findRecipients).toHaveBeenCalledWith(['alice', 'carol', 'bob']);
	});

	it('sends iOS devices through APNs and Android devices through FCM', async () => {
		const ios = device('a'.repeat(64), 'ios');
		const android = device('fcm-token', 'android', 'dave');
		const { deps, apns, fcm } = createDependencies([ios, android]);

		await announcePublishedReview(review, 'alice', deps);

		const notification = {
			title: 'Ny recension: Bar Himmel',
			body: expect.any(String),
			slug: 'bar-himmel'
		};
		expect(apns.send).toHaveBeenCalledWith([ios], notification);
		expect(fcm.send).toHaveBeenCalledWith([android], notification);
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: 'review_notification',
				outcome: 'success',
				username: 'alice',
				targetSlug: 'bar-himmel',
				details: { recipients: 2, delivered: 2, failed: 0, removed: 0, skipped: 0 }
			})
		);
	});

	it('forgets the tokens the push services reject as gone', async () => {
		const { deps, apns } = createDependencies([device('b'.repeat(64), 'ios')]);
		apns.send.mockResolvedValueOnce({ delivered: 0, failed: 1, invalidTokens: ['b'.repeat(64)] });

		await announcePublishedReview(review, 'alice', deps);

		expect(deps.removeDevices).toHaveBeenCalledWith(['b'.repeat(64)]);
	});

	it('skips a platform whose push service is not configured', async () => {
		const { deps, apns } = createDependencies([device('fcm-token', 'android')]);
		deps.senders = { apns, fcm: null };

		await announcePublishedReview(review, 'alice', deps);

		expect(apns.send).not.toHaveBeenCalled();
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				details: { recipients: 1, delivered: 0, failed: 0, removed: 0, skipped: 1 }
			})
		);
	});

	it('does nothing at all when no push service is configured', async () => {
		const { deps } = createDependencies([device('fcm-token', 'android')]);
		deps.senders = { apns: null, fcm: null };

		await announcePublishedReview(review, 'alice', deps);

		expect(deps.findRecipients).not.toHaveBeenCalled();
		expect(deps.audit).not.toHaveBeenCalled();
	});

	it('never throws, and records a failed announcement', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { deps, fcm } = createDependencies([device('fcm-token', 'android')]);
		fcm.send.mockRejectedValueOnce(new Error('network down'));

		await expect(announcePublishedReview(review, 'alice', deps)).resolves.toBeUndefined();

		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: 'review_notification',
				outcome: 'failure',
				reason: 'send_failed'
			})
		);
		vi.restoreAllMocks();
	});
});
