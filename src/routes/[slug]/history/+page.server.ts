import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error } from '@sveltejs/kit';
import { MAX_SLUG_LENGTH, sanitizeSlug } from '$lib/server/review-form';
import { withReviewVisibility } from '$lib/server/review-publication';

export const load: PageServerLoad = async ({ params, locals }) => {
	let decodedSlug: string;
	try {
		decodedSlug = decodeURIComponent(params.slug);
	} catch {
		throw error(404);
	}
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
		throw error(404);
	}

	const bar = await bars.findOne(withReviewVisibility({ slug: safeSlug }, Boolean(locals.user)));
	if (!bar) throw error(404);

	const history = [...(bar.changeLog ?? [])].reverse().map((entry, index) => ({
		id: `${bar._id.toString()}-${index}`,
		updatedAt: entry.updatedAt,
		updatedBy: entry.updatedBy,
		changes: entry.changes
	}));

	return {
		bar: {
			title: bar.title,
			slug: bar.slug
		},
		history
	};
};
