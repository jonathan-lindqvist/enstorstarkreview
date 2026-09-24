import type { BarReviewFormData } from '$lib/types/bar-review';
import type { ReviewFormProblem, ReviewFailureStatus } from '$lib/types/review-form';

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
	formData?: BarReviewFormData
): ReviewWriteResult => reviewProblem({ status, message, pointer }, formData);
