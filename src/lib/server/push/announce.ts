import type { AuditEventInput } from '$lib/server/audit';
import type { BarReview } from '$lib/types/bar-review';
import type { PushDevice, PushPlatform } from '$lib/types/push-device';
import { buildReviewNotification, type ReviewNotification } from './message';

export interface PushSendReport {
	delivered: number;
	failed: number;
	/** Tokens the push service reports as gone; they are forgotten. */
	invalidTokens: string[];
}

export interface PushSender {
	send(devices: PushDevice[], notification: ReviewNotification): Promise<PushSendReport>;
}

export interface AnnounceDependencies {
	findRecipients(excludedUsernames: string[]): Promise<PushDevice[]>;
	removeDevices(tokens: string[]): Promise<void>;
	/** Null when that push service has no credentials, as in development and CI. */
	senders: { apns: PushSender | null; fcm: PushSender | null };
	audit(event: AuditEventInput): Promise<void>;
}

const SENDER_BY_PLATFORM: Record<PushPlatform, keyof AnnounceDependencies['senders']> = {
	ios: 'apns',
	android: 'fcm'
};

/** The credited reviewers and the publisher already know about the review. */
const getExcludedUsernames = (
	review: Pick<BarReview, 'author' | 'coAuthors'>,
	publisher: string
): string[] => {
	const credited = [review.author, ...(Array.isArray(review.coAuthors) ? review.coAuthors : [])];
	const names = [...credited, publisher]
		.filter((name): name is string => typeof name === 'string')
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	return [...new Set(names)];
};

/**
 * Notifies every registered phone, except the reviewers', about a first publication.
 * Never throws: a push failure must not affect publication.
 */
export const announcePublishedReview = async (
	review: BarReview,
	publisher: string,
	deps: AnnounceDependencies
): Promise<void> => {
	if (!deps.senders.apns && !deps.senders.fcm) return;

	const audit = (event: Omit<AuditEventInput, 'eventType' | 'username'>) =>
		deps.audit({
			eventType: 'review_notification',
			username: publisher,
			targetSlug: review.slug,
			targetId: review._id.toString(),
			...event
		});

	try {
		const devices = await deps.findRecipients(getExcludedUsernames(review, publisher));
		const notification = buildReviewNotification(review);
		const totals = { recipients: devices.length, delivered: 0, failed: 0, removed: 0, skipped: 0 };

		const batches = new Map<keyof AnnounceDependencies['senders'], PushDevice[]>();
		for (const device of devices) {
			const key = SENDER_BY_PLATFORM[device.platform];
			if (!key || !deps.senders[key]) {
				totals.skipped += 1;
				continue;
			}
			batches.set(key, [...(batches.get(key) ?? []), device]);
		}

		const results = await Promise.allSettled(
			[...batches].map(([key, batch]) => deps.senders[key]!.send(batch, notification))
		);

		const invalidTokens: string[] = [];
		let sendFailed = false;
		for (const result of results) {
			if (result.status === 'rejected') {
				sendFailed = true;
				console.error('Review notification send failed:', result.reason);
				continue;
			}
			totals.delivered += result.value.delivered;
			totals.failed += result.value.failed;
			invalidTokens.push(...result.value.invalidTokens);
		}

		if (invalidTokens.length > 0) {
			await deps.removeDevices(invalidTokens);
			totals.removed = invalidTokens.length;
		}

		await audit(
			sendFailed
				? { outcome: 'failure', reason: 'send_failed', details: totals }
				: { outcome: 'success', details: totals }
		);
	} catch (error) {
		console.error('Review notification failed:', error);
		await audit({ outcome: 'failure', reason: 'announce_failed' });
	}
};
