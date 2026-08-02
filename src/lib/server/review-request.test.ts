import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ReviewRequestConfigurationError,
	ReviewRequestDeliveryError,
	buildReviewRequestDiscordPayload,
	deliverReviewRequest,
	validateReviewRequestForm
} from './review-request';

const submittedAt = new Date('2026-08-02T12:00:00.000Z');
const submission = {
	barName: 'Bar Himmel',
	location: 'Andra Långgatan 10, Göteborg',
	motivation: 'Bra stämning och rimliga priser.',
	submittedAt
};

describe('review request form validation', () => {
	it('normalizes control characters and keeps meaningful line breaks', () => {
		const data = new FormData();
		data.set('barName', '  Bar\u0000   Himmel  ');
		data.set('location', ' Göteborg\t centrum ');
		data.set('motivation', ' Första raden \r\n\r\n\r\n Andra raden\u0007 ');

		const result = validateReviewRequestForm(data, submittedAt);

		expect(result).toEqual({
			ok: true,
			submission: {
				barName: 'Bar Himmel',
				location: 'Göteborg centrum',
				motivation: 'Första raden\n\nAndra raden',
				submittedAt
			}
		});
	});

	it('returns Swedish field errors and sanitized values at every boundary', () => {
		const data = new FormData();
		data.set('barName', 'x');
		data.set('location', 'y'.repeat(161));
		data.set('motivation', 'z'.repeat(1001));

		const result = validateReviewRequestForm(data);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.values.barName).toBe('x');
		expect(result.fieldErrors).toEqual({
			barName: 'Ange barens namn med minst 2 tecken.',
			location: 'Ort eller adress får vara högst 160 tecken.',
			motivation: 'Motiveringen får vara högst 1 000 tecken.'
		});
	});
});

describe('review request delivery', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('builds a mention-safe Discord embed without private anti-spam data', async () => {
		const fetchImplementation = vi.fn<typeof fetch>(async () =>
			Promise.resolve(new Response(null, { status: 204 }))
		);

		const result = await deliverReviewRequest(submission, {
			webhookUrl: 'https://discord.example/webhook',
			fetchImplementation
		});

		expect(result).toBe('discord');
		expect(fetchImplementation).toHaveBeenCalledTimes(1);
		const [url, request] = fetchImplementation.mock.calls[0];
		expect(url).toBe('https://discord.example/webhook');
		expect(request?.method).toBe('POST');
		const payload = JSON.parse(String(request?.body));
		expect(payload).toEqual(buildReviewRequestDiscordPayload(submission));
		expect(payload.allowed_mentions).toEqual({ parse: [] });
		expect(JSON.stringify(payload)).not.toContain('ip');
	});

	it('uses a content-free development sink when no webhook is configured', async () => {
		const fetchImplementation = vi.fn<typeof fetch>();

		const result = await deliverReviewRequest(submission, {
			webhookUrl: '',
			fetchImplementation,
			isProduction: false
		});

		expect(result).toBe('development_sink');
		expect(fetchImplementation).not.toHaveBeenCalled();
	});

	it('requires a webhook in production', async () => {
		const fetchImplementation = vi.fn<typeof fetch>();

		await expect(
			deliverReviewRequest(submission, {
				webhookUrl: '',
				fetchImplementation,
				isProduction: true
			})
		).rejects.toBeInstanceOf(ReviewRequestConfigurationError);
		expect(fetchImplementation).not.toHaveBeenCalled();
	});

	it('rejects non-success responses without retrying', async () => {
		const fetchImplementation = vi.fn<typeof fetch>(async () =>
			Promise.resolve(new Response(null, { status: 429 }))
		);

		await expect(
			deliverReviewRequest(submission, {
				webhookUrl: 'https://discord.example/webhook',
				fetchImplementation
			})
		).rejects.toBeInstanceOf(ReviewRequestDeliveryError);
		expect(fetchImplementation).toHaveBeenCalledTimes(1);
	});

	it('aborts delivery after the configured timeout', async () => {
		vi.useFakeTimers();
		const fetchImplementation = vi.fn(
			(_url: URL | RequestInfo, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('Aborted', 'AbortError'));
					});
				})
		);
		const delivery = deliverReviewRequest(submission, {
			webhookUrl: 'https://discord.example/webhook',
			fetchImplementation: fetchImplementation as typeof fetch,
			timeoutMs: 25
		});
		const deliveryExpectation = expect(delivery).rejects.toBeInstanceOf(ReviewRequestDeliveryError);

		await vi.advanceTimersByTimeAsync(25);

		await deliveryExpectation;
		expect(fetchImplementation).toHaveBeenCalledTimes(1);
	});
});
