import { serializeReview } from '$lib/server/reviews/serialization';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error, fail, redirect } from '@sveltejs/kit';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import { withReviewVisibility } from '$lib/server/review-publication';
import { publishReview } from '$lib/server/reviews/publish';
import { publishReviewDependencies } from '$lib/server/reviews/production';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { loadReviewCoordinates } from '$lib/server/reviews/coordinates';

export const load: PageServerLoad = async ({ params, locals }) => {
	const safeSlug = parseRouteSlug(params.slug);
	if (!safeSlug) {
		throw error(404);
	}

	const bar = await bars.findOne(withReviewVisibility({ slug: safeSlug }, Boolean(locals.user)));
	if (!bar) throw error(404);
	const coordinates = await loadReviewCoordinates([bar]);

	return {
		bar: serializeReview(bar),
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
	}
};
