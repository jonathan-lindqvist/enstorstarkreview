import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { consumeReviewRequestRateLimit } from '$lib/server/review-request-rate-limit';
import { deliverReviewRequest } from '$lib/server/review-requests/delivery';
import { submitReviewRequest } from '$lib/server/review-requests/submit';

const dependencies = {
	consumeRateLimit: consumeReviewRequestRateLimit,
	deliver: deliverReviewRequest,
	audit: logAuditEvent,
	now: () => new Date()
};

export const actions: Actions = {
	requestReview: async (event) => {
		const { request, url } = event;
		const ip = getRequestIp(event);
		const origin = request.headers.get('origin');

		if (origin !== url.origin) {
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'denied',
				ip,
				reason: 'invalid_origin'
			});
			return fail(403, { success: false, message: 'Förfrågan kunde inte verifieras.' });
		}

		let data: FormData;
		try {
			data = await request.formData();
		} catch (error) {
			console.error('Review request form parse failed:', error);
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'failure',
				ip,
				reason: 'form_parse_failed'
			});
			return fail(400, { success: false, message: 'Formuläret kunde inte läsas.' });
		}

		const result = await submitReviewRequest(data, ip, dependencies);
		if (!result.ok) {
			if (result.retryAfterSeconds !== undefined)
				event.setHeaders({ 'retry-after': String(result.retryAfterSeconds) });
			return fail(result.status, result.data);
		}
		return result.data;
	}
};
