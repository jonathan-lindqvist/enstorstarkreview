import { Effect } from 'effect';
import { loadHomeReviewPage, parseHomeReviewQuery } from '$lib/server/reviews/home';
import { runWeb } from '$lib/server/web';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const authenticated = Boolean(event.locals.user);
	const result = await runWeb(
		event,
		Effect.gen(function* () {
			const query = yield* parseHomeReviewQuery(event.url);
			return { ...(yield* loadHomeReviewPage(query)), ...query };
		})
	);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	return { ...result, showPublicationStatus: authenticated };
};
