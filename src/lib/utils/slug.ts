/**
 * Generate a URL-friendly slug from a string
 * Handles Swedish characters (åäö) by converting them
 */
export function generateSlug(text: string): string {
	return (
		text
			.toLowerCase()
			.trim()
			// Replace Swedish characters with URL-friendly equivalents
			.replace(/å/g, 'a')
			.replace(/ä/g, 'a')
			.replace(/ö/g, 'o')
			// Replace spaces and special characters with hyphens
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_]+/g, '-')
			.replace(/^-+|-+$/g, '')
	);
}
