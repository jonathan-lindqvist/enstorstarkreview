import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error, fail, redirect } from '@sveltejs/kit';
import { MAX_SLUG_LENGTH, sanitizeSlug } from '$lib/server/review-form';
import {
	getReviewPublicationStatus,
	publishDraftReview,
	withReviewVisibility
} from '$lib/server/review-publication';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { invalidatePublicReviewStatisticsCache } from '$lib/server/review-statistics';

const getSafeRouteSlug = (slug: string): string | null => {
	let decodedSlug: string;
	try {
		decodedSlug = decodeURIComponent(slug);
	} catch {
		return null;
	}

	const safeSlug = sanitizeSlug(decodedSlug);
	return safeSlug.length && safeSlug.length <= MAX_SLUG_LENGTH ? safeSlug : null;
};

export const load: PageServerLoad = async ({ params, locals }) => {
	const safeSlug = getSafeRouteSlug(params.slug);
	if (!safeSlug) {
		throw error(404);
	}

	const bar = await bars.findOne(withReviewVisibility({ slug: safeSlug }, Boolean(locals.user)));
	if (!bar) throw error(404);

	return {
		bar: {
			...bar,
			_id: bar._id.toString(),
			publicationStatus: getReviewPublicationStatus(bar)
		},
		user: locals.user ? { username: locals.user.username } : null
	};
};

export const actions: Actions = {
	publish: async (event) => {
		const { locals, params } = event;
		const username = locals.user?.username ?? null;
		const ip = getRequestIp(event);
		const safeSlug = getSafeRouteSlug(params.slug);

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

		await logAuditEvent({
			eventType: 'review_publish',
			outcome: 'attempt',
			username,
			ip,
			targetSlug: safeSlug ?? undefined
		});

		if (!safeSlug) {
			await logAuditEvent({
				eventType: 'review_publish',
				outcome: 'failure',
				username,
				ip,
				reason: 'invalid_slug'
			});
			return fail(404, { message: 'Recensionen hittades inte' });
		}

		try {
			const result = await publishDraftReview(bars, safeSlug, locals.user.username, new Date());
			if (result.outcome === 'not_found') {
				await logAuditEvent({
					eventType: 'review_publish',
					outcome: 'failure',
					username,
					ip,
					targetSlug: safeSlug,
					reason: 'review_not_found'
				});
				return fail(404, { message: 'Recensionen hittades inte' });
			}

			if (result.outcome === 'already_published') {
				await logAuditEvent({
					eventType: 'review_publish',
					outcome: 'failure',
					username,
					ip,
					targetSlug: safeSlug,
					targetId: result.review._id.toString(),
					reason: 'already_published'
				});
				return fail(409, { message: 'Recensionen är redan publicerad' });
			}

			if (result.outcome === 'conflict') {
				await logAuditEvent({
					eventType: 'review_publish',
					outcome: 'failure',
					username,
					ip,
					targetSlug: safeSlug,
					targetId: result.review._id.toString(),
					reason: 'publication_state_changed'
				});
				return fail(409, {
					message: 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.'
				});
			}

			invalidatePublicReviewStatisticsCache();

			await logAuditEvent({
				eventType: 'review_publish',
				outcome: 'success',
				username,
				ip,
				targetSlug: safeSlug,
				targetId: result.review._id.toString()
			});
		} catch (err) {
			console.error('Review publish failed:', err);
			await logAuditEvent({
				eventType: 'review_publish',
				outcome: 'failure',
				username,
				ip,
				targetSlug: safeSlug,
				reason: 'publish_failed'
			});
			return fail(500, { message: 'Kunde inte publicera recensionen' });
		}

		throw redirect(303, `/${encodeURIComponent(safeSlug)}`);
	}
};
