import { validateReviewRequestForm, readReviewRequestHoneypot } from './validation';
import { ReviewRequestConfigurationError, ReviewRequestDeliveryError } from './delivery';
import type { deliverReviewRequest } from './delivery';
import { REVIEW_REQUEST_IP_LIMIT, REVIEW_REQUEST_GLOBAL_LIMIT } from './policy';
import type { consumeReviewRequestRateLimit } from '$lib/server/review-request-rate-limit';
import type { AuditEventInput } from '$lib/server/audit';
import type { ReviewRequestValues, ReviewRequestFieldErrors } from '$lib/types/review-request';

interface SubmissionResponse {
	success: boolean;
	message: string;
	values?: ReviewRequestValues;
	fieldErrors?: ReviewRequestFieldErrors;
}
export type ReviewRequestResult =
	| { ok: true; data: SubmissionResponse }
	| { ok: false; status: number; data: SubmissionResponse; retryAfterSeconds?: number };
interface SubmissionDependencies {
	consumeRateLimit: typeof consumeReviewRequestRateLimit;
	deliver: typeof deliverReviewRequest;
	audit(event: AuditEventInput): Promise<void>;
	now(): Date;
}
const SUCCESS_MESSAGE = 'Tack! Ditt önskemål har skickats.';
const DEVELOPMENT_SINK_MESSAGE = 'Önskemålet hanterades lokalt och skickades inte till Discord.';

/** A server-owned admission, never read from a client request. */
export interface ReviewRequestIpAdmission {
	ok: true;
	ip: string;
}

/** Admit before API JSON parsing; the web workflow supplies values for form restoration. */
export const admitReviewRequestIp = async (
	ip: string,
	deps: Pick<SubmissionDependencies, 'consumeRateLimit' | 'audit'>,
	values?: ReviewRequestValues
): Promise<ReviewRequestIpAdmission | Extract<ReviewRequestResult, { ok: false }>> => {
	let limit;
	try {
		limit = await deps.consumeRateLimit('ip', ip, REVIEW_REQUEST_IP_LIMIT);
	} catch (error) {
		console.error('Review request IP rate limit failed:', error);
		await deps.audit({
			eventType: 'review_request',
			outcome: 'failure',
			ip,
			reason: 'ip_rate_limit_failed'
		});
		return {
			ok: false,
			status: 503,
			data: {
				success: false,
				message: 'Formuläret är tillfälligt otillgängligt. Försök igen senare.',
				...(values ? { values } : {})
			}
		};
	}
	if (limit.allowed) return { ok: true, ip };
	await deps.audit({
		eventType: 'review_request',
		outcome: 'rate_limited',
		ip,
		reason: 'ip_limit_exceeded',
		details: { retryAfterSeconds: limit.retryAfterSeconds }
	});
	return {
		ok: false,
		status: 429,
		retryAfterSeconds: limit.retryAfterSeconds,
		data: {
			success: false,
			message: 'Du har skickat för många önskemål. Försök igen senare.',
			...(values ? { values } : {})
		}
	};
};

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

export const submitReviewRequest = async (
	data: FormData,
	ip: string,
	deps: SubmissionDependencies,
	options: { ipAdmission?: ReviewRequestIpAdmission } = {}
): Promise<ReviewRequestResult> => {
	let retryAfterSeconds: number | undefined;
	const requestFailure = (status: number, data: SubmissionResponse): ReviewRequestResult => ({
		ok: false,
		status,
		data,
		retryAfterSeconds
	});
	if (readReviewRequestHoneypot(data)) {
		await deps.audit({
			eventType: 'review_request',
			outcome: 'denied',
			ip,
			reason: 'honeypot_filled'
		});
		return { ok: true, data: { success: true, message: SUCCESS_MESSAGE } };
	}

	const validation = validateReviewRequestForm(data, deps.now());
	const values = getValues(validation);

	if (options.ipAdmission?.ip !== ip) {
		const admission = await admitReviewRequestIp(ip, deps, values);
		if (!admission.ok) return admission;
	}

	await deps.audit({ eventType: 'review_request', outcome: 'attempt', ip });

	if (!validation.ok) {
		await deps.audit({
			eventType: 'review_request',
			outcome: 'failure',
			ip,
			reason: 'validation_failed'
		});
		return requestFailure(400, {
			success: false,
			message: 'Kontrollera de markerade fälten.',
			values: validation.values,
			fieldErrors: validation.fieldErrors
		});
	}

	let globalLimit;
	try {
		globalLimit = await deps.consumeRateLimit(
			'global',
			'discord-delivery',
			REVIEW_REQUEST_GLOBAL_LIMIT
		);
	} catch (error) {
		console.error('Review request global rate limit failed:', error);
		await deps.audit({
			eventType: 'review_request',
			outcome: 'failure',
			ip,
			reason: 'global_rate_limit_failed'
		});
		return requestFailure(503, {
			success: false,
			message: 'Formuläret är tillfälligt otillgängligt. Försök igen senare.',
			values
		});
	}

	if (!globalLimit.allowed) {
		retryAfterSeconds = globalLimit.retryAfterSeconds;
		await deps.audit({
			eventType: 'review_request',
			outcome: 'rate_limited',
			ip,
			reason: 'global_limit_exceeded',
			details: { retryAfterSeconds: globalLimit.retryAfterSeconds }
		});
		return requestFailure(429, {
			success: false,
			message: 'Vi har fått många önskemål just nu. Försök igen senare.',
			values
		});
	}

	let deliveryResult;
	try {
		deliveryResult = await deps.deliver(validation.submission);
	} catch (error) {
		const configurationError = error instanceof ReviewRequestConfigurationError;
		const deliveryError = error instanceof ReviewRequestDeliveryError;
		console.error('Review request delivery failed:', error);
		await deps.audit({
			eventType: 'review_request',
			outcome: 'failure',
			ip,
			reason: configurationError
				? 'webhook_configuration_failed'
				: deliveryError
					? 'webhook_delivery_failed'
					: 'unexpected_delivery_failure'
		});
		return requestFailure(configurationError ? 503 : 502, {
			success: false,
			message: 'Önskemålet kunde inte skickas just nu. Försök igen om en stund.',
			values
		});
	}

	await deps.audit({
		eventType: 'review_request',
		outcome: 'success',
		ip,
		reason: deliveryResult === 'development_sink' ? 'development_sink' : undefined
	});
	return {
		ok: true,
		data: {
			success: true,
			message: deliveryResult === 'development_sink' ? DEVELOPMENT_SINK_MESSAGE : SUCCESS_MESSAGE
		}
	};
};
