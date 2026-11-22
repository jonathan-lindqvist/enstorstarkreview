import { error, json } from '@sveltejs/kit';
import {
	loadHomeReviewIndex,
	loadHomeReviewPage,
	parseHomeReviewIds,
	parseHomeReviewQuery
} from '$lib/server/reviews/home';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const query = parseHomeReviewQuery(url);
	const ids = parseHomeReviewIds(url.searchParams);
	const view = url.searchParams.get('view');
	if ((view && view !== 'index') || (view && ids)) throw error(400, 'Ogiltig sökning.');
	const headers = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
	try {
		return json(
			view === 'index'
				? { index: await loadHomeReviewIndex(query, Boolean(locals.user)) }
				: await loadHomeReviewPage(query, Boolean(locals.user), ids),
			{ headers }
		);
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
		return json(
			{ message: 'Kunde inte hämta recensionerna. Försök igen.' },
			{ status: 503, headers }
		);
	}
};
