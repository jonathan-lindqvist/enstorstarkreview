import { MAX_SLUG_LENGTH } from './form';
import { sanitizeSlug } from '$lib/utils/slug';

/** Returns the sanitized slug from a route parameter, or null when it cannot identify a review. */
export const parseRouteSlug = (slug: string): string | null => {
	let decodedSlug: string;
	try {
		decodedSlug = decodeURIComponent(slug);
	} catch {
		return null;
	}

	const safeSlug = sanitizeSlug(decodedSlug);
	return safeSlug.length && safeSlug.length <= MAX_SLUG_LENGTH ? safeSlug : null;
};
