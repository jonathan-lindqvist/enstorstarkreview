export const REVIEW_REQUEST_IP_LIMIT = {
	maxAttempts: 5,
	windowMs: 24 * 60 * 60 * 1_000
} as const;

export const REVIEW_REQUEST_GLOBAL_LIMIT = {
	maxAttempts: 30,
	windowMs: 60 * 60 * 1_000
} as const;
