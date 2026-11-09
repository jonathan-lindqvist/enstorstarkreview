/** MongoDB's duplicate-key error, from any unique index. */
export const isDuplicateKeyError = (error: unknown): boolean => {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: number }).code === 11000
	);
};

export const isDuplicateSlugError = isDuplicateKeyError;
