import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import {
	REVIEW_REQUEST_GLOBAL_LIMIT,
	REVIEW_REQUEST_IP_LIMIT,
	consumeReviewRequestRateLimit
} from '$lib/server/review-request-rate-limit';
import {
	ReviewRequestConfigurationError,
	ReviewRequestDeliveryError,
	deliverReviewRequest,
	readReviewRequestHoneypot,
	validateReviewRequestForm,
	type ReviewRequestValues
} from '$lib/server/review-request';

const SUCCESS_MESSAGE = 'Tack! Ditt önskemål har skickats.';
const DEVELOPMENT_SINK_MESSAGE = 'Önskemålet hanterades lokalt och skickades inte till Discord.';

const getValues = (
	validation: ReturnType<typeof validateReviewRequestForm>
): ReviewRequestValues => {
	if (!validation.ok) return validation.values;
	return {
		barName: validation.submission.barName,
		location: validation.submission.location,
		motivation: validation.submission.motivation
	};
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

		if (readReviewRequestHoneypot(data)) {
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'denied',
				ip,
				reason: 'honeypot_filled'
			});
			return { success: true, message: SUCCESS_MESSAGE };
		}

		const validation = validateReviewRequestForm(data);
		const values = getValues(validation);

		let ipLimit;
		try {
			ipLimit = await consumeReviewRequestRateLimit('ip', ip, REVIEW_REQUEST_IP_LIMIT);
		} catch (error) {
			console.error('Review request IP rate limit failed:', error);
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'failure',
				ip,
				reason: 'ip_rate_limit_failed'
			});
			return fail(503, {
				success: false,
				message: 'Formuläret är tillfälligt otillgängligt. Försök igen senare.',
				values
			});
		}

		if (!ipLimit.allowed) {
			event.setHeaders({ 'retry-after': String(ipLimit.retryAfterSeconds) });
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'rate_limited',
				ip,
				reason: 'ip_limit_exceeded',
				details: { retryAfterSeconds: ipLimit.retryAfterSeconds }
			});
			return fail(429, {
				success: false,
				message: 'Du har skickat för många önskemål. Försök igen senare.',
				values
			});
		}

		await logAuditEvent({ eventType: 'review_request', outcome: 'attempt', ip });

		if (!validation.ok) {
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'failure',
				ip,
				reason: 'validation_failed'
			});
			return fail(400, {
				success: false,
				message: 'Kontrollera de markerade fälten.',
				values: validation.values,
				fieldErrors: validation.fieldErrors
			});
		}

		let globalLimit;
		try {
			globalLimit = await consumeReviewRequestRateLimit(
				'global',
				'discord-delivery',
				REVIEW_REQUEST_GLOBAL_LIMIT
			);
		} catch (error) {
			console.error('Review request global rate limit failed:', error);
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'failure',
				ip,
				reason: 'global_rate_limit_failed'
			});
			return fail(503, {
				success: false,
				message: 'Formuläret är tillfälligt otillgängligt. Försök igen senare.',
				values
			});
		}

		if (!globalLimit.allowed) {
			event.setHeaders({ 'retry-after': String(globalLimit.retryAfterSeconds) });
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'rate_limited',
				ip,
				reason: 'global_limit_exceeded',
				details: { retryAfterSeconds: globalLimit.retryAfterSeconds }
			});
			return fail(429, {
				success: false,
				message: 'Vi har fått många önskemål just nu. Försök igen senare.',
				values
			});
		}

		let deliveryResult;
		try {
			deliveryResult = await deliverReviewRequest(validation.submission);
		} catch (error) {
			const configurationError = error instanceof ReviewRequestConfigurationError;
			const deliveryError = error instanceof ReviewRequestDeliveryError;
			console.error('Review request delivery failed:', error);
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'failure',
				ip,
				reason: configurationError
					? 'webhook_configuration_failed'
					: deliveryError
						? 'webhook_delivery_failed'
						: 'unexpected_delivery_failure'
			});
			return fail(configurationError ? 503 : 502, {
				success: false,
				message: 'Önskemålet kunde inte skickas just nu. Försök igen om en stund.',
				values
			});
		}

		await logAuditEvent({
			eventType: 'review_request',
			outcome: 'success',
			ip,
			reason: deliveryResult === 'development_sink' ? 'development_sink' : undefined
		});
		return {
			success: true,
			message: deliveryResult === 'development_sink' ? DEVELOPMENT_SINK_MESSAGE : SUCCESS_MESSAGE
		};
	}
};
