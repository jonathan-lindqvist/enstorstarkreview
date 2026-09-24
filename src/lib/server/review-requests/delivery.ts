import { env } from '$env/dynamic/private';
import type { ReviewRequestSubmission } from '$lib/types/review-request';

export const REVIEW_REQUEST_DISCORD_TIMEOUT_MS = 5_000;

export class ReviewRequestConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReviewRequestConfigurationError';
	}
}

export class ReviewRequestDeliveryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReviewRequestDeliveryError';
	}
}

export const buildReviewRequestDiscordPayload = (submission: ReviewRequestSubmission) => ({
	username: 'En Stor Stark Review',
	allowed_mentions: { parse: [] as string[] },
	embeds: [
		{
			title: 'Ny recensionsförfrågan',
			color: 0x0ea5e9,
			fields: [
				{ name: 'Bar', value: submission.barName },
				{ name: 'Ort eller adress', value: submission.location },
				{
					name: 'Motivering',
					value: submission.motivation || 'Ingen motivering angavs.'
				}
			],
			timestamp: submission.submittedAt.toISOString()
		}
	]
});

interface DeliverReviewRequestOptions {
	webhookUrl?: string;
	fetchImplementation?: typeof fetch;
	timeoutMs?: number;
	isProduction?: boolean;
}

export type ReviewRequestDeliveryResult = 'discord' | 'development_sink';

export const deliverReviewRequest = async (
	submission: ReviewRequestSubmission,
	options: DeliverReviewRequestOptions = {}
): Promise<ReviewRequestDeliveryResult> => {
	const webhookUrl =
		options.webhookUrl === undefined
			? env.REVIEW_REQUEST_DISCORD_WEBHOOK_URL?.trim()
			: options.webhookUrl.trim();
	const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

	if (!webhookUrl) {
		if (isProduction) {
			throw new ReviewRequestConfigurationError('REVIEW_REQUEST_DISCORD_WEBHOOK_URL is required');
		}
		return 'development_sink';
	}

	const fetchImplementation = options.fetchImplementation ?? fetch;
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? REVIEW_REQUEST_DISCORD_TIMEOUT_MS
	);

	try {
		const response = await fetchImplementation(webhookUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(buildReviewRequestDiscordPayload(submission)),
			signal: controller.signal
		});

		if (!response.ok) {
			throw new ReviewRequestDeliveryError(`Discord webhook returned HTTP ${response.status}`);
		}

		return 'discord';
	} catch (error) {
		if (error instanceof ReviewRequestDeliveryError) throw error;
		throw new ReviewRequestDeliveryError('Discord webhook request failed');
	} finally {
		clearTimeout(timeout);
	}
};
