import type { ReviewAuthorshipFields, ReviewFormProblem } from '$lib/types/review-form';
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

export const validateReviewAuthors = async (
	authors: string[],
	loadValidUsernames: (authors: string[]) => Promise<string[]>,
	existingReview?: ReviewAuthorCredit
): Promise<ReviewFormProblem | null> => {
	if (authors.length === 0)
		return { status: 400, message: 'Välj minst en författare', pointer: '/authors' };
	const existingAuthors = new Set(getReviewAuthors(existingReview));
	const newAuthors = authors.filter((username) => !existingAuthors.has(username));
	if (newAuthors.length === 0) return null;

	const validUsernames = new Set(await loadValidUsernames(newAuthors));
	return newAuthors.every((username) => validUsernames.has(username))
		? null
		: { status: 400, message: 'En eller flera författare är ogiltiga', pointer: '/authors' };
};
