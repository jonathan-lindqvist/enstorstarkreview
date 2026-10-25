import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { MAX_SLUG_LENGTH } from '$lib/server/reviews/form';
import { sanitizeSlug } from '$lib/utils/slug';
import { serializeReview } from '$lib/server/reviews/serialization';
import { loadReviewPriceComparison } from '$lib/server/reviews/price-comparison';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import { reviewETag } from '$lib/server/rpc/representations';
import { WebForm } from '$lib/server/rpc/input';
import { webClient, webFailure } from '$lib/server/rpc/web';

export const load: PageServerLoad = async (event) => {
	const { params, locals } = event;
	const ip = getRequestIp(event);

	if (!locals.user) {
		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'denied',
			ip,
			reason: 'unauthenticated_edit_page_access'
		});
		throw redirect(302, '/login');
	}

	// Decode the slug to handle Swedish characters (åäö) and other Unicode
	const decodedSlug = decodeURIComponent(params.slug);
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
		throw error(404, 'Hittades inte');
	}

	const bar = await bars.findOne({ $and: [{ slug: safeSlug }, ACTIVE_REVIEW_FILTER] });
	if (!bar) throw error(404, 'Hittades inte');

	const { users } = await webClient(event).users.list();

	return {
		bar: serializeReview(bar),
		// The edit and delete forms send this back, so neither can overwrite a newer version.
		version: reviewETag(bar),
		currentUsername: locals.user.username,
		availableUsers: users,
		priceComparison: await loadReviewPriceComparison(bar._id),
		nearbyComparison: await loadNearbyReviewComparison(bar._id)
	};
};

export const actions: Actions = {
	default: async (event) => {
		let review;
		try {
			review = await webClient(event).reviews.update({
				params: { slug: event.params.slug },
				headers: { 'if-match': event.url.searchParams.get('version') ?? '' },
				body: WebForm.fromRequest(event.request)
			});
		} catch (cause) {
			return webFailure(cause, { form: true });
		}
		redirect(303, `/${encodeURIComponent(review.slug)}`);
	}
};
