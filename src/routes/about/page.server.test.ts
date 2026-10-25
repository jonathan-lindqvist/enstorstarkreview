import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewRequestRateLimiter } from '$lib/server/review-request-rate-limit';
import {
	ReviewRequestConfigurationError,
	ReviewRequestDelivery,
	ReviewRequestDeliveryError,
	type ReviewRequestDeliveryResult
} from '$lib/server/review-requests/delivery';
import { makeTestWorld, useTestApp, type TestWorld } from '$lib/server/testing';
import { actions } from './+page.server';

const mocks = {
	consumeRateLimit: vi.fn(),
	deliverReviewRequest: vi.fn<(submission: unknown) => Promise<ReviewRequestDeliveryResult>>()
};

// Scripted rate limits and delivery; the real workflow, audit log and form handling run.
const overrides = Layer.mergeAll(
	Layer.succeed(
		ReviewRequestRateLimiter,
		ReviewRequestRateLimiter.of({
			consume: (...args) => Effect.promise(() => mocks.consumeRateLimit(...args))
		})
	),
	Layer.succeed(
		ReviewRequestDelivery,
		ReviewRequestDelivery.of({
			deliver: (submission) =>
				Effect.tryPromise({
					try: () => mocks.deliverReviewRequest(submission),
					catch: (error) => error as ReviewRequestConfigurationError | ReviewRequestDeliveryError
				})
		})
	)
);

type ReviewRequestAction = NonNullable<(typeof actions)['requestReview']>;
type ReviewRequestEvent = Parameters<ReviewRequestAction>[0];

const makeEvent = (
	fields: Record<string, string> = {},
	origin = 'http://localhost'
): ReviewRequestEvent => {
	const body = new URLSearchParams({
		barName: 'Bar Himmel',
		location: 'Göteborg',
		motivation: 'Bra stämning',
		website: '',
		...fields
	});

	return {
		request: new Request('http://localhost/about?/requestReview', {
			method: 'POST',
			headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
			body
		}),
		url: new URL('http://localhost/about?/requestReview'),
		locals: { user: null, session: null },
		getClientAddress: () => '203.0.113.40',
		setHeaders: vi.fn()
	} as unknown as ReviewRequestEvent;
};

describe('/about review request action', () => {
	let world: TestWorld;
	let restore: () => Promise<void>;
	afterEach(() => restore());
	beforeEach(() => {
		world = makeTestWorld();
		restore = useTestApp(world, { overrides });
		mocks.consumeRateLimit.mockReset().mockResolvedValue({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 4
		});
		mocks.deliverReviewRequest.mockReset().mockResolvedValue('discord');
	});

	it('delivers a validated request after both rate limits allow it', async () => {
		const result = await actions.requestReview!(makeEvent());

		expect(result).toEqual({ success: true, message: 'Tack! Ditt önskemål har skickats.' });
		expect(mocks.consumeRateLimit).toHaveBeenNthCalledWith(1, 'ip', '203.0.113.40', {
			maxAttempts: 5,
			windowMs: 86_400_000
		});
		expect(mocks.consumeRateLimit).toHaveBeenNthCalledWith(2, 'global', 'discord-delivery', {
			maxAttempts: 30,
			windowMs: 3_600_000
		});
		expect(mocks.deliverReviewRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				barName: 'Bar Himmel',
				location: 'Göteborg',
				motivation: 'Bra stämning',
				submittedAt: expect.any(Date)
			})
		);
		expect(JSON.stringify(world.audits)).not.toContain('Bar Himmel');
	});

	it('reports successful local interception without auditing request content', async () => {
		mocks.deliverReviewRequest.mockResolvedValueOnce('development_sink');

		const result = await actions.requestReview!(makeEvent());

		expect(result).toEqual({
			success: true,
			message: 'Önskemålet hanterades lokalt och skickades inte till Discord.'
		});
		expect(world.audits.at(-1)).toEqual({
			eventType: 'review_request',
			outcome: 'success',
			ip: '203.0.113.40',
			reason: 'development_sink'
		});
		expect(JSON.stringify(world.audits)).not.toContain('Bar Himmel');
	});

	it('silently accepts honeypot submissions without consuming limits or delivering', async () => {
		const result = await actions.requestReview!(makeEvent({ website: 'https://spam.example' }));

		expect(result).toEqual({ success: true, message: 'Tack! Ditt önskemål har skickats.' });
		expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
		expect(mocks.deliverReviewRequest).not.toHaveBeenCalled();
		expect(world.audits).toContainEqual(
			expect.objectContaining({ outcome: 'denied', reason: 'honeypot_filled' })
		);
	});

	it('denies cross-origin requests before parsing or delivery', async () => {
		const result = await actions.requestReview!(makeEvent({}, 'https://attacker.example'));

		expect(result).toMatchObject({ status: 403, data: { success: false } });
		expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
		expect(mocks.deliverReviewRequest).not.toHaveBeenCalled();
	});

	it('returns field errors and preserves sanitized values', async () => {
		const result = await actions.requestReview!(
			makeEvent({ barName: ' x ', location: ' G\u0007 ' })
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				success: false,
				message: 'Kontrollera de markerade fälten.',
				values: { barName: 'x', location: 'G', motivation: 'Bra stämning' },
				fieldErrors: {
					barName: 'Ange barens namn med minst 2 tecken.',
					location: 'Ange en ort eller adress med minst 2 tecken.'
				}
			}
		});
		expect(mocks.consumeRateLimit).toHaveBeenCalledTimes(1);
		expect(mocks.deliverReviewRequest).not.toHaveBeenCalled();
	});

	it('returns 429 and Retry-After when the IP limit is exhausted', async () => {
		mocks.consumeRateLimit.mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 900,
			remainingAttempts: 0
		});
		const event = makeEvent();

		const result = await actions.requestReview!(event);

		expect(result).toMatchObject({ status: 429, data: { success: false } });
		expect(event.setHeaders).toHaveBeenCalledWith({ 'retry-after': '900' });
		expect(mocks.deliverReviewRequest).not.toHaveBeenCalled();
	});

	it('returns 429 when the global delivery limit is exhausted', async () => {
		mocks.consumeRateLimit
			.mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0, remainingAttempts: 4 })
			.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 1_200, remainingAttempts: 0 });

		const result = await actions.requestReview!(makeEvent());

		expect(result).toMatchObject({
			status: 429,
			data: { message: 'Vi har fått många önskemål just nu. Försök igen senare.' }
		});
		expect(mocks.deliverReviewRequest).not.toHaveBeenCalled();
	});

	it.each([
		[new ReviewRequestConfigurationError({ message: 'missing' }), 503],
		[new ReviewRequestDeliveryError({ message: 'failed' }), 502]
	])('keeps values when Discord delivery fails', async (error, status) => {
		mocks.deliverReviewRequest.mockRejectedValueOnce(error);

		const result = await actions.requestReview!(makeEvent());

		expect(result).toMatchObject({
			status,
			data: {
				message: 'Önskemålet kunde inte skickas just nu. Försök igen om en stund.',
				values: { barName: 'Bar Himmel', location: 'Göteborg', motivation: 'Bra stämning' }
			}
		});
	});
});
