import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { loadReviewPriceComparison } from '$lib/server/reviews/price-comparison';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import { WebForm } from '$lib/server/rpc/input';
import { webClient, webFailure } from '$lib/server/rpc/web';

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	if (!locals.user) {
		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'denied',
			ip: getRequestIp(event),
			reason: 'unauthenticated_create_page_access'
		});
		throw redirect(302, '/login');
	}

	const { users } = await webClient(event).users.list();

	return {
		username: locals.user.username,
		availableUsers: users,
		priceComparison: await loadReviewPriceComparison(),
		nearbyComparison: await loadNearbyReviewComparison()
	};
};

export const actions: Actions = {
	default: async (event) => {
		let review;
		try {
			review = await webClient(event).reviews.create({
				body: WebForm.fromRequest(event.request)
			});
		} catch (cause) {
			return webFailure(cause, { form: true });
		}
		redirect(303, `/${encodeURIComponent(review.slug)}`);
	}
};
