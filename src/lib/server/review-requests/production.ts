import { logAuditEvent } from '#lib/server/audit.js';
import { consumeReviewRequestRateLimit } from '#lib/server/review-request-rate-limit.js';
import { deliverReviewRequest } from './delivery';

export const reviewRequestDependencies = {
	consumeRateLimit: consumeReviewRequestRateLimit,
	deliver: deliverReviewRequest,
	audit: logAuditEvent,
	now: () => new Date()
};
