import { error } from '@sveltejs/kit';
import { Effect } from 'effect';
import { MAX_SLUG_LENGTH } from '$lib/server/reviews/form';
import { ReviewStore } from '$lib/server/reviews/store';
import { Viewer } from '$lib/server/request';
import { runWeb } from '$lib/server/web';
import { sanitizeSlug } from '$lib/utils/slug';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	let decodedSlug: string;
	try {
		decodedSlug = decodeURIComponent(event.params.slug);
	} catch {
		error(404);
	}
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) error(404);

	const bar = await runWeb(
		event,
		Effect.gen(function* () {
			const authenticated = yield* Viewer.isAuthenticated;
			return yield* ReviewStore.use((store) => store.findVisibleBySlug(safeSlug, authenticated));
		})
	);
	if (!bar) error(404);

	const history = [...(bar.changeLog ?? [])].reverse().map((entry, index) => ({
		id: `${bar._id.toString()}-${index}`,
		updatedAt: entry.updatedAt,
		updatedBy: entry.updatedBy,
		changes: entry.changes
	}));

	return { bar: { title: bar.title, slug: bar.slug }, history };
};
