import { logAuditEvent } from '$lib/server/audit';
import { consumeReviewRequestRateLimit } from '$lib/server/review-request-rate-limit';
import { deliverReviewRequest } from './delivery';

export const reviewRequestDependencies = {
	consumeRateLimit: consumeReviewRequestRateLimit,
	deliver: deliverReviewRequest,
	audit: logAuditEvent,
	now: () => new Date()
};
