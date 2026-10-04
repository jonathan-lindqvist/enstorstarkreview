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
