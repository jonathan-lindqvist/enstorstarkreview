import type { ObjectId } from 'mongodb';
import type { BarReviewFormData } from '$lib/types/bar-review';
import type {
	ReviewFormProblem,
	ReviewFailureStatus,
	ReviewProblemCode
} from '$lib/types/review-form';

export type SavedReview = { ok: true; slug: string; reviewId: ObjectId };

export type ReviewWriteResult =
	| SavedReview
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
