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
