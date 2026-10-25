import { Clock, Effect, Schema } from 'effect';
import type { ReviewRequestValues } from '$lib/types/review-request';
import { audit } from '$lib/server/audit';
import { BadGateway, FieldError, RateLimited, ServiceUnavailable } from '$lib/server/errors';
import { ReviewRequestRateLimiter } from '$lib/server/review-request-rate-limit';
import { RequestContext } from '$lib/server/request';
import { ReviewRequestDelivery } from './delivery';
import { REVIEW_REQUEST_GLOBAL_LIMIT, REVIEW_REQUEST_IP_LIMIT } from './policy';
import { readReviewRequestHoneypot, validateReviewRequestForm } from './validation';

const SUCCESS_MESSAGE = 'Tack! Ditt önskemål har skickats.';
const DEVELOPMENT_SINK_MESSAGE = 'Önskemålet hanterades lokalt och skickades inte till Discord.';
const UNAVAILABLE_MESSAGE = 'Formuläret är tillfälligt otillgängligt. Försök igen senare.';

/** The request fields failed validation; `errors` use JSON pointers such as `/barName`. */
export class ReviewRequestInvalid extends Schema.TaggedError<ReviewRequestInvalid>()(
	'ReviewRequestInvalid',
	{ message: Schema.String, errors: Schema.Array(FieldError) },
	{ httpApiStatus: 422, description: 'One or more fields are invalid. See `errors`.' }
) {}

/** The normalized form values, for restoring a failed no-JS form. */
export const reviewRequestValues = (data: FormData): ReviewRequestValues => {
	const validation = validateReviewRequestForm(data);
	return validation.ok
		? {
				barName: validation.submission.barName,
				location: validation.submission.location,
				motivation: validation.submission.motivation
			}
		: validation.values;
};

/** A server-owned admission, never read from a client request. */
export interface ReviewRequestIpAdmission {
	readonly ip: string;
}

/** Admits the client IP. The API calls this before reading the JSON body. */
export const admitReviewRequestIp = Effect.gen(function* () {
	const { ip } = yield* RequestContext;
	const limit = yield* ReviewRequestRateLimiter.use((limiter) =>
		limiter.consume('ip', ip, REVIEW_REQUEST_IP_LIMIT)
	).pipe(
		Effect.catchTag('MongoError', (error) =>
			Effect.sync(() => console.error('Review request IP rate limit failed:', error.cause)).pipe(
				Effect.andThen(
					audit({
						eventType: 'review_request',
						outcome: 'failure',
						ip,
						reason: 'ip_rate_limit_failed'
					})
				),
				Effect.andThen(Effect.fail(new ServiceUnavailable({ message: UNAVAILABLE_MESSAGE })))
			)
		)
	);
	if (limit.allowed) return { ip } satisfies ReviewRequestIpAdmission;
	yield* audit({
		eventType: 'review_request',
		outcome: 'rate_limited',
		ip,
		reason: 'ip_limit_exceeded',
		details: { retryAfterSeconds: limit.retryAfterSeconds }
	});
	return yield* new RateLimited({
		message: 'Du har skickat för många önskemål. Försök igen senare.',
		retryAfterSeconds: limit.retryAfterSeconds
	});
});

/**
 * Anonymous review requests from the about page and the API. Order: honeypot (silent success),
 * IP quota, validation, global quota, then one Discord delivery without retry. The IP is never
 * sent to Discord.
 */
export const submitReviewRequest = Effect.fn('submitReviewRequest')(function* (
	data: FormData,
	options: { ipAdmission?: ReviewRequestIpAdmission } = {}
) {
	const { ip } = yield* RequestContext;
	const auditRequest = (
		outcome: 'attempt' | 'denied' | 'failure' | 'rate_limited' | 'success',
		reason?: string,
		details?: Record<string, unknown>
	) => audit({ eventType: 'review_request', outcome, ip, reason, details });

	if (readReviewRequestHoneypot(data)) {
		yield* auditRequest('denied', 'honeypot_filled');
		return { message: SUCCESS_MESSAGE };
	}

	const validation = validateReviewRequestForm(data, new Date(yield* Clock.currentTimeMillis));
	if (options.ipAdmission?.ip !== ip) yield* admitReviewRequestIp;
	yield* auditRequest('attempt');

	if (!validation.ok) {
		yield* auditRequest('failure', 'validation_failed');
		return yield* new ReviewRequestInvalid({
			message: 'Kontrollera de markerade fälten.',
			errors: Object.entries(validation.fieldErrors).map(([field, detail]) => ({
				pointer: `/${field}`,
				detail: detail ?? 'Kontrollera de markerade fälten.'
			}))
		});
	}

	const globalLimit = yield* ReviewRequestRateLimiter.use((limiter) =>
		limiter.consume('global', 'discord-delivery', REVIEW_REQUEST_GLOBAL_LIMIT)
	).pipe(
		Effect.catchTag('MongoError', (error) =>
			Effect.sync(() =>
				console.error('Review request global rate limit failed:', error.cause)
			).pipe(
				Effect.andThen(auditRequest('failure', 'global_rate_limit_failed')),
				Effect.andThen(Effect.fail(new ServiceUnavailable({ message: UNAVAILABLE_MESSAGE })))
			)
		)
	);
	if (!globalLimit.allowed) {
		yield* auditRequest('rate_limited', 'global_limit_exceeded', {
			retryAfterSeconds: globalLimit.retryAfterSeconds
		});
		return yield* new RateLimited({
			message: 'Vi har fått många önskemål just nu. Försök igen senare.',
			retryAfterSeconds: globalLimit.retryAfterSeconds
		});
	}

	const deliveryFailed = 'Önskemålet kunde inte skickas just nu. Försök igen om en stund.';
	const result = yield* ReviewRequestDelivery.use((delivery) =>
		delivery.deliver(validation.submission)
	).pipe(
		Effect.catchTags({
			ReviewRequestConfigurationError: (error) =>
				Effect.sync(() => console.error('Review request delivery failed:', error)).pipe(
					Effect.andThen(auditRequest('failure', 'webhook_configuration_failed')),
					Effect.andThen(Effect.fail(new ServiceUnavailable({ message: deliveryFailed })))
				),
			ReviewRequestDeliveryError: (error) =>
				Effect.sync(() => console.error('Review request delivery failed:', error)).pipe(
					Effect.andThen(auditRequest('failure', 'webhook_delivery_failed')),
					Effect.andThen(Effect.fail(new BadGateway({ message: deliveryFailed })))
				)
		})
	);

	yield* auditRequest('success', result === 'development_sink' ? 'development_sink' : undefined);
	return { message: result === 'development_sink' ? DEVELOPMENT_SINK_MESSAGE : SUCCESS_MESSAGE };
});
