import type { BarReviewFormData } from '#lib/types/bar-review.js';
import type {
	ReviewFormProblem,
	ReviewFailureStatus,
	ReviewProblemCode
} from '#lib/types/review-form.js';

export type ReviewWriteResult =
	| { ok: true; slug: string }
	| { ok: false; problem: ReviewFormProblem; formData?: BarReviewFormData };

export const reviewProblem = (
	problem: ReviewFormProblem,
	formData?: BarReviewFormData
): ReviewWriteResult => ({ ok: false, problem, formData });
export const reviewFailure = (
	status: ReviewFailureStatus,
	message: string,
	pointer = '/',
	formData?: BarReviewFormData,
	code?: ReviewProblemCode
): ReviewWriteResult =>
	reviewProblem(code ? { status, message, pointer, code } : { status, message, pointer }, formData);
