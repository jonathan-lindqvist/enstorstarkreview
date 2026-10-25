import { Effect } from 'effect';
import type { ReviewAuthorshipFields } from '$lib/types/review-form';
import { ReviewInvalid } from '$lib/server/errors';
import {
	getReviewAuthorOptions,
	getReviewAuthors,
	type ReviewAuthorCredit
} from '$lib/utils/authors';

export const buildReviewAuthorship = (
	selectedAuthors: string[],
	currentUsername: string,
	existingReview?: ReviewAuthorCredit
): ReviewAuthorshipFields => {
	const selected = new Set(selectedAuthors);
	const orderedAuthors = getReviewAuthorOptions(
		currentUsername,
		selectedAuthors,
		existingReview
	).filter((username) => selected.has(username));
	const author = selected.has(currentUsername)
		? currentUsername
		: existingReview && selected.has(existingReview.author)
			? existingReview.author
			: orderedAuthors[0];
	if (!author) throw new Error('At least one author must be selected');

	return { author, coAuthors: orderedAuthors.filter((username) => username !== author) };
};

/**
 * Checks that newly selected authors are existing accounts. Already credited names stay valid,
 * so a review keeps credits for deleted accounts; only new names are looked up.
 */
export const validateReviewAuthors = <E, R>(
	authors: string[],
	existingUsernames: (authors: string[]) => Effect.Effect<string[], E, R>,
	existingReview?: ReviewAuthorCredit
): Effect.Effect<void, ReviewInvalid | E, R> =>
	Effect.gen(function* () {
		if (authors.length === 0) {
			return yield* new ReviewInvalid({ message: 'Välj minst en författare', pointer: '/authors' });
		}
		const existingAuthors = new Set(getReviewAuthors(existingReview));
		const newAuthors = authors.filter((username) => !existingAuthors.has(username));
		if (newAuthors.length === 0) return;

		const validUsernames = new Set(yield* existingUsernames(newAuthors));
		if (!newAuthors.every((username) => validUsernames.has(username))) {
			return yield* new ReviewInvalid({
				message: 'En eller flera författare är ogiltiga',
				pointer: '/authors'
			});
		}
	});
