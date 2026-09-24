import { stripControlCharacters } from './review-text';

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

export const sanitizeSlug = (value: string): string => {
	return stripControlCharacters(value)
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^0-9A-Za-z\u00C0-\u017F-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^[-]+|[-]+$/g, '');
};
