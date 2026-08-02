import { env } from '$env/dynamic/private';

export const REVIEW_REQUEST_DISCORD_TIMEOUT_MS = 5_000;

const BAR_NAME_MIN_LENGTH = 2;
const BAR_NAME_MAX_LENGTH = 100;
const LOCATION_MIN_LENGTH = 2;
const LOCATION_MAX_LENGTH = 160;
const MOTIVATION_MAX_LENGTH = 1_000;

export interface ReviewRequestValues {
	barName: string;
	location: string;
	motivation: string;
}

export interface ReviewRequestSubmission extends ReviewRequestValues {
	submittedAt: Date;
}

export type ReviewRequestFieldErrors = Partial<Record<keyof ReviewRequestValues, string>>;

export type ReviewRequestValidationResult =
	| { ok: true; submission: ReviewRequestSubmission }
	| { ok: false; values: ReviewRequestValues; fieldErrors: ReviewRequestFieldErrors };

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

const normalizeSingleLine = (value: FormDataEntryValue | null): string => {
	if (typeof value !== 'string') return '';

	return value
		.replace(/\p{Cc}+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
};

const normalizeMultiline = (value: FormDataEntryValue | null): string => {
	if (typeof value !== 'string') return '';

	return value
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) =>
			line
				.replace(/\p{Cc}+/gu, ' ')
				.replace(/\s+/gu, ' ')
				.trim()
		)
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
};

export const readReviewRequestHoneypot = (data: FormData): string => {
	return normalizeSingleLine(data.get('website'));
};

export const validateReviewRequestForm = (
	data: FormData,
	now = new Date()
): ReviewRequestValidationResult => {
	const values: ReviewRequestValues = {
		barName: normalizeSingleLine(data.get('barName')),
		location: normalizeSingleLine(data.get('location')),
		motivation: normalizeMultiline(data.get('motivation'))
	};
	const fieldErrors: ReviewRequestFieldErrors = {};

	if (values.barName.length < BAR_NAME_MIN_LENGTH) {
		fieldErrors.barName = 'Ange barens namn med minst 2 tecken.';
	} else if (values.barName.length > BAR_NAME_MAX_LENGTH) {
		fieldErrors.barName = 'Barens namn får vara högst 100 tecken.';
	}

	if (values.location.length < LOCATION_MIN_LENGTH) {
		fieldErrors.location = 'Ange en ort eller adress med minst 2 tecken.';
	} else if (values.location.length > LOCATION_MAX_LENGTH) {
		fieldErrors.location = 'Ort eller adress får vara högst 160 tecken.';
	}

	if (values.motivation.length > MOTIVATION_MAX_LENGTH) {
		fieldErrors.motivation = 'Motiveringen får vara högst 1 000 tecken.';
	}

	if (Object.keys(fieldErrors).length > 0) {
		return { ok: false, values, fieldErrors };
	}

	return {
		ok: true,
		submission: {
			...values,
			submittedAt: now
		}
	};
};

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
