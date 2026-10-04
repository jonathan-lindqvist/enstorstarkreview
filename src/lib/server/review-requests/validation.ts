import type {
	ReviewRequestValues,
	ReviewRequestValidationResult,
	ReviewRequestFieldErrors
} from '$lib/types/review-request';

const BAR_NAME_MIN_LENGTH = 2;
const BAR_NAME_MAX_LENGTH = 100;
const LOCATION_MIN_LENGTH = 2;
const LOCATION_MAX_LENGTH = 160;
const MOTIVATION_MAX_LENGTH = 1_000;

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
