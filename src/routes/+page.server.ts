import { bars } from '#lib/db/bars.js';
import { loadHomeReviewPage, parseHomeReviewQuery } from '#lib/server/reviews/home.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals, setHeaders }) => {
	const query = parseHomeReviewQuery(url);
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		...(await loadHomeReviewPage(bars, query, Boolean(locals.user))),
		...query,
		showPublicationStatus: Boolean(locals.user)
	};
};
