import { serializeReview } from '$lib/server/reviews/serialization';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error, fail, redirect } from '@sveltejs/kit';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import { withReviewVisibility } from '$lib/server/review-publication';
import { publishReview } from '$lib/server/reviews/publish';
import { deleteReview } from '$lib/server/reviews/delete';
import {
	deleteReviewDependencies,
	publishReviewDependencies
} from '$lib/server/reviews/production';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { loadReviewCoordinates } from '$lib/server/reviews/coordinates';
import { getReviewPublicationDate } from '$lib/server/review-feed';
import { parseReviewVersion } from '$lib/server/reviews/version';

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
		const { locals, params } = event;
		const ip = getRequestIp(event);
		const safeSlug = parseRouteSlug(params.slug);

		if (!locals.user) {
			await logAuditEvent({
				eventType: 'review_publish',
				outcome: 'denied',
				ip,
				targetSlug: safeSlug ?? undefined,
				reason: 'unauthenticated_publish'
			});
			return fail(401, { message: 'Du är inte inloggad' });
		}

		const result = await publishReview(
			safeSlug,
			{ username: locals.user.username, ip },
			publishReviewDependencies
		);
		if (!result.ok) return fail(result.status, { message: result.message });

		throw redirect(303, `/${encodeURIComponent(result.slug)}`);
	},

	delete: async (event) => {
		const { locals, params } = event;
		const ip = getRequestIp(event);
		const safeSlug = parseRouteSlug(params.slug);

		if (!locals.user) {
			await logAuditEvent({
				eventType: 'review_delete',
				outcome: 'denied',
				ip,
				targetSlug: safeSlug ?? undefined,
				reason: 'unauthenticated_delete'
			});
			return fail(401, { message: 'Du är inte inloggad' });
		}

		// The edit page sends the version it showed, like the API's If-Match, so a review that
		// changed since then is not deleted. A post without a version deletes the current one.
		const version = parseReviewVersion((await event.request.formData()).get('version'));
		if (version === 'invalid') {
			return fail(400, { message: 'Ogiltiga formulärdata. Ladda om sidan och försök igen.' });
		}

		const result = await deleteReview(
			safeSlug,
			{ username: locals.user.username, ip, expectedUpdatedAt: version },
			deleteReviewDependencies
		);
		if (!result.ok) return fail(result.status, { message: result.message });

		throw redirect(303, '/admin/reviews?borttagen=1');
	}
};
