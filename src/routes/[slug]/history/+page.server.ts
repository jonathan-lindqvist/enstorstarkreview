import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error } from '@sveltejs/kit';
import { MAX_SLUG_LENGTH, sanitizeSlug } from '$lib/server/review-form';

export const load: PageServerLoad = async ({ params }) => {
	const decodedSlug = decodeURIComponent(params.slug);
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
		throw error(404);
	}

	const bar = await bars.findOne({ slug: safeSlug });
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
