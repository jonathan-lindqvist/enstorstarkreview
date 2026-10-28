export interface ReviewAuthorCredit {
	author: string;
	coAuthors?: string[] | string;
}

export function getReviewAuthors(review?: ReviewAuthorCredit | null): string[] {
	if (!review) return [];
	const coAuthors = Array.isArray(review.coAuthors)
		? review.coAuthors
		: review.coAuthors
			? [review.coAuthors]
			: [];
	return [...new Set([review.author, ...coAuthors].filter((name) => name.length > 0))];
}

export function getReviewAuthorOptions(
	currentUsername: string,
	availableUsernames: string[],
	review?: ReviewAuthorCredit | null
): string[] {
	return [
		...new Set([
			currentUsername,
			...getReviewAuthors(review),
			...availableUsernames.toSorted((a, b) => a.localeCompare(b, 'sv'))
		])
	].filter((name) => name.length > 0);
}

export function capitalizeAuthorName(name: string): string {
	if (!name) return name;
	return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatAuthorList(coAuthors?: string[] | string): string {
	if (!coAuthors) return '';
	if (typeof coAuthors === 'string') {
		return capitalizeAuthorName(coAuthors);
	}
	return coAuthors.length > 0 ? coAuthors.map(capitalizeAuthorName).join(', ') : '';
}

export function formatAuthors(author: string, coAuthors?: string[] | string): string {
	const formattedAuthor = capitalizeAuthorName(author);
	const formattedCoAuthors = formatAuthorList(coAuthors);

	return formattedCoAuthors ? `${formattedAuthor}, ${formattedCoAuthors}` : formattedAuthor;
}

/** "Victor, Jonathan & Theo", as the apps credit reviewers. */
export function formatAuthorCredit(names: string[]): string {
	const capitalized = names.map(capitalizeAuthorName);
	if (capitalized.length < 2) return capitalized[0] ?? '';
	return `${capitalized.slice(0, -1).join(', ')} & ${capitalized.at(-1)}`;
}

export const AUTHOR_AVATAR_COLOR_COUNT = 12;

/** A stable colour per name, matching the apps' avatar hues. */
export function getAuthorAvatarIndex(name: string): number {
	let sum = 0;
	for (const character of name.toLowerCase()) sum += character.codePointAt(0) ?? 0;
	return sum % AUTHOR_AVATAR_COLOR_COUNT;
}
