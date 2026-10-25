import { serializeReview } from '$lib/server/reviews/serialization';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error, redirect } from '@sveltejs/kit';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import { withReviewVisibility } from '$lib/server/review-publication';
import { loadReviewCoordinates } from '$lib/server/reviews/coordinates';
import { getReviewPublicationDate } from '$lib/server/review-feed';
import { webClient, webFailure } from '$lib/server/rpc/web';

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	const safeSlug = parseRouteSlug(params.slug);
	if (!safeSlug) {
		throw error(404);
	}

	const bar = await bars.findOne(withReviewVisibility({ slug: safeSlug }, Boolean(locals.user)));
	if (!bar) throw error(404);
	const coordinates = await loadReviewCoordinates([bar]);
	setHeaders({ 'cache-control': 'private, no-store' });

	return {
		bar: serializeReview(bar),
		publishedAt: getReviewPublicationDate(bar)?.toISOString() ?? null,
		coordinates: coordinates[bar._id.toString()] ?? null,
		user: locals.user ? { username: locals.user.username } : null
	};
};

export const actions: Actions = {
	publish: async (event) => {
		let review;
		try {
			review = await webClient(event).reviews.publish({ params: { slug: event.params.slug } });
		} catch (cause) {
			return webFailure(cause);
		}
		redirect(303, `/${encodeURIComponent(review.slug)}`);
	},

	// The edit page's delete form sends the version it showed, like the API's If-Match.
	delete: async (event) => {
		try {
			await webClient(event).reviews.delete({
				params: { slug: event.params.slug },
				headers: { 'if-match': event.url.searchParams.get('version') ?? '' }
			});
		} catch (cause) {
			return webFailure(cause);
		}
		redirect(303, '/admin/reviews?borttagen=1');
	}
};
