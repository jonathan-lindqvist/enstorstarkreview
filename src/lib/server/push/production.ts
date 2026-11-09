import { env } from '$env/dynamic/private';
import { pushDevices } from '$lib/db/push-devices';
import { logAuditEvent } from '$lib/server/audit';
import { consumeReviewRequestRateLimit } from '$lib/server/review-request-rate-limit';
import type { BarReview } from '$lib/types/bar-review';
import { announcePublishedReview, type AnnounceDependencies } from './announce';
import { createApnsSender, createHttp2ApnsTransport } from './apns';
import { readPushConfig } from './config';
import type { PushDeviceDependencies } from './devices';
import { createFcmSender } from './fcm';
import { createPushDeviceStore } from './persistence';

const store = createPushDeviceStore(pushDevices);
const now = () => new Date();

export const pushDeviceDependencies: PushDeviceDependencies = {
	upsertDevice: store.upsertDevice,
	removeDevice: store.removeDevice,
	consumeRateLimit: consumeReviewRequestRateLimit,
	audit: logAuditEvent,
	now
};

let senders: AnnounceDependencies['senders'] | null = null;

/** Read on first use, so the server starts even with broken push credentials. */
const getSenders = (): AnnounceDependencies['senders'] => {
	if (senders) return senders;
	const config = readPushConfig(env);
	for (const problem of config.problems) console.warn(problem);
	senders = {
		apns: config.apns
			? createApnsSender({ ...config.apns, createTransport: createHttp2ApnsTransport, now })
			: null,
		fcm: config.fcm ? createFcmSender({ serviceAccount: config.fcm, fetch, now }) : null
	};
	return senders;
};

/** Announces a first publication in the background; publication never waits for it. */
export const notifyReviewPublished = (review: BarReview, publisher: string): void => {
	void announcePublishedReview(review, publisher, {
		findRecipients: store.findRecipients,
		removeDevices: store.removeDevices,
		senders: getSenders(),
		audit: logAuditEvent
	}).catch((error) => console.error('Review notification failed:', error));
};
