import { error, fail, redirect } from '@sveltejs/kit';
import { Effect } from 'effect';
import { getReviewPublicationDate } from '$lib/server/review-feed';
import { Viewer } from '$lib/server/request';
import { loadReviewCoordinates } from '$lib/server/reviews/coordinates';
import { deleteReview } from '$lib/server/reviews/delete';
import { publishReview } from '$lib/server/reviews/publish';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import { serializeReview } from '$lib/server/reviews/serialization';
import { ReviewStore } from '$lib/server/reviews/store';
import { auditDenied, failWith, runWeb, runWebAsUser } from '$lib/server/web';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const safeSlug = parseRouteSlug(event.params.slug);
	if (!safeSlug) error(404);

	const result = await runWeb(
		event,
		Effect.gen(function* () {
			const authenticated = yield* Viewer.isAuthenticated;
			const bar = yield* ReviewStore.use((store) => store.findVisibleBySlug(safeSlug, authenticated));
			if (!bar) return null;
			const coordinates = yield* loadReviewCoordinates([bar]);
			return { bar, coordinates: coordinates[bar._id.toString()] ?? null };
		})
	);
	if (!result) error(404);
	event.setHeaders({ 'cache-control': 'private, no-store' });

	return {
		bar: serializeReview(result.bar),
		publishedAt: getReviewPublicationDate(result.bar)?.toISOString() ?? null,
		coordinates: result.coordinates,
		user: event.locals.user ? { username: event.locals.user.username } : null
	};
};

export const actions: Actions = {
	publish: async (event) => {
		const safeSlug = parseRouteSlug(event.params.slug);
		if (!event.locals.user) {
			await runWeb(event, auditDenied('review_publish', 'unauthenticated_publish', safeSlug));
			return fail(401, { message: 'Du är inte inloggad' });
		}

		const result = await runWebAsUser(event, publishReview(safeSlug).pipe(failWith()));
		if ('slug' in result) redirect(303, `/${encodeURIComponent(result.slug)}`);
		return result;
	},

	delete: async (event) => {
		const safeSlug = parseRouteSlug(event.params.slug);
		if (!event.locals.user) {
			await runWeb(event, auditDenied('review_delete', 'unauthenticated_delete', safeSlug));
			return fail(401, { message: 'Du är inte inloggad' });
		}

		// The edit page sends the version it showed. Like the API's If-Match, a review that
		// changed since then is not deleted.
		const version = Number((await event.request.formData().catch(() => null))?.get('version'));
		if (!Number.isSafeInteger(version) || version <= 0) {
			return fail(400, { message: 'Ogiltiga formulärdata. Ladda om sidan och försök igen.' });
		}

		const result = await runWebAsUser(
			event,
			deleteReview(safeSlug, { expectedUpdatedAt: new Date(version) }).pipe(failWith())
		);
		if (result) return result;
		redirect(303, '/admin/reviews?borttagen=1');
	}
};
