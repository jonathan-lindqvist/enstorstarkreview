import { error, json } from '@sveltejs/kit';
import { Effect } from 'effect';
import {
	loadHomeReviewIndex,
	loadHomeReviewPage,
	parseHomeReviewIds,
	parseHomeReviewQuery
} from '$lib/server/reviews/home';
import { runWeb } from '$lib/server/web';
import type { RequestHandler } from './$types';

const UNAVAILABLE = 'Kunde inte hämta recensionerna. Försök igen.';

export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const headers = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
	const body = await runWeb(
		event,
		Effect.gen(function* () {
			const query = yield* parseHomeReviewQuery(url);
			const ids = yield* parseHomeReviewIds(url.searchParams);
			const view = url.searchParams.get('view');
			if ((view && view !== 'index') || (view && ids)) error(400, 'Ogiltig sökning.');
			return view === 'index'
				? { index: yield* loadHomeReviewIndex(query) }
				: yield* loadHomeReviewPage(query, ids);
		}).pipe(Effect.catchTag('MongoError', () => Effect.succeed(null)))
	);
	if (body === null) return json({ message: UNAVAILABLE }, { status: 503, headers });
	return json(body, { headers });
};
