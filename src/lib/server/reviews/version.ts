/** Longest accepted version field: milliseconds since the epoch fit comfortably in 16 digits. */
const MAX_VERSION_LENGTH = 16;

/**
 * Parses the review version a web form sent back: the `updatedAt` it showed, in milliseconds.
 * Returns undefined when the form sent none, and 'invalid' for anything that is not a positive
 * whole number, so callers can reject it before touching storage.
 */
export const parseReviewVersion = (
	field: FormDataEntryValue | null
): Date | undefined | 'invalid' => {
	if (field === null || field === '') return undefined;
	if (typeof field !== 'string' || field.length > MAX_VERSION_LENGTH || !/^\d+$/.test(field)) {
		return 'invalid';
	}
	const milliseconds = Number(field);
	return Number.isSafeInteger(milliseconds) && milliseconds > 0
		? new Date(milliseconds)
		: 'invalid';
};
