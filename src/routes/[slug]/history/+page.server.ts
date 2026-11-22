import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { MAX_SLUG_LENGTH } from '$lib/server/reviews/form';
import { sanitizeSlug } from '$lib/utils/slug';
import { findVisibleReviewBySlug } from '$lib/server/reviews/queries';

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

	const bar = await findVisibleReviewBySlug(safeSlug, Boolean(locals.user));
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
