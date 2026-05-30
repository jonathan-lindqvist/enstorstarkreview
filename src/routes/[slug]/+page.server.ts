import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error } from '@sveltejs/kit';
import { MAX_SLUG_LENGTH, sanitizeSlug } from '$lib/server/review-form';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Decode the slug to handle Swedish characters (åäö) and other Unicode
	const decodedSlug = decodeURIComponent(params.slug);
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
		throw error(404);
	}

	const bar = await bars.findOne({ slug: safeSlug });
	if (!bar) throw error(404);

	return {
		bar: {
			...bar,
			_id: bar._id.toString()
		},
		user: locals.user ? { username: locals.user.username } : null
	};
};
