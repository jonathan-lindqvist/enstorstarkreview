import { fail, type ActionFailure } from '@sveltejs/kit';
import type { BarReviewFormData, ReviewFormActionData } from '$lib/types/bar-review';
import type { ReviewFailureStatus, ReviewFormProblem } from '$lib/types/review-form';

export const failReviewForm = (
	status: ReviewFailureStatus,
	message: string,
	pointer: string = '/',
	formData?: BarReviewFormData
): ActionFailure<ReviewFormActionData> => {
	return fail(status, {
		pointer,
		message,
		...formData
	});
};

export const failReviewFormProblem = (
	problem: ReviewFormProblem,
	formData?: BarReviewFormData
): ActionFailure<ReviewFormActionData> => {
	return failReviewForm(problem.status, problem.message, problem.pointer, formData);
};
