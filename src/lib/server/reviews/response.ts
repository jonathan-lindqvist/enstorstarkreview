import { fail, type ActionFailure } from '@sveltejs/kit';
import { Effect, Predicate } from 'effect';
import type { BarReviewFormData, ReviewFormActionData } from '$lib/types/bar-review';
import type { ReviewFailureStatus } from '$lib/types/review-form';
import { httpStatusOf, messageOf } from '$lib/server/errors';
import { buildReviewFormData } from './form';

export const failReviewForm = (
	status: ReviewFailureStatus,
	message: string,
	pointer: string = '/',
	formData?: BarReviewFormData
): ActionFailure<ReviewFormActionData> => fail(status, { pointer, message, ...formData });

// Review forms answered validation, duplicate slugs and storage failures with 400 before the
// migration; the API answers a duplicate slug with 409.
const reviewFormStatus = (failure: unknown): ReviewFailureStatus => {
	if (Predicate.isTagged(failure, 'DuplicateSlug')) return 400;
	const status = httpStatusOf(failure);
	if (status === 401 || status === 404 || status === 409 || status === 412) return status;
	return 400;
};

/**
 * Turns review workflow errors into the review form's `fail()` payload: the Swedish message,
 * the web field pointer to focus, and the submitted values so the no-JS form is restored.
 * Errors without an HTTP status (defects, storage outages outside the workflow) are rethrown.
 */
export const failReviewFormWith =
	(data: FormData) =>
	<A, E, R>(
		effect: Effect.Effect<A, E, R>
	): Effect.Effect<A | ActionFailure<ReviewFormActionData>, never, R> =>
		effect.pipe(
			Effect.catch((failure) =>
				httpStatusOf(failure) === undefined
					? Effect.die(failure)
					: Effect.succeed(
							failReviewForm(
								reviewFormStatus(failure),
								messageOf(failure) ?? 'Något gick fel',
								Predicate.hasProperty(failure, 'pointer') && typeof failure.pointer === 'string'
									? failure.pointer
									: '/',
								buildReviewFormData(data)
							)
						)
			)
		);
