import { error, redirect } from '@sveltejs/kit';
import { Effect } from 'effect';
import { audit } from '$lib/server/audit';
import { RequestContext } from '$lib/server/request';
import { editReview } from '$lib/server/reviews/edit';
import { MAX_SLUG_LENGTH } from '$lib/server/reviews/form';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import { loadReviewPriceComparison } from '$lib/server/reviews/price-comparison';
import { failReviewForm, failReviewFormWith } from '$lib/server/reviews/response';
import { serializeReview } from '$lib/server/reviews/serialization';
import { ReviewStore } from '$lib/server/reviews/store';
import { UserStore } from '$lib/server/users';
import { auditDenied, runWeb, runWebAsUser } from '$lib/server/web';
import { sanitizeSlug } from '$lib/utils/slug';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user } = event.locals;
	if (!user) {
		await runWeb(event, auditDenied('review_edit', 'unauthenticated_edit_page_access'));
		redirect(302, '/login');
	}

	// Decode the slug to handle Swedish characters (åäö) and other Unicode
	const safeSlug = sanitizeSlug(decodeURIComponent(event.params.slug));
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) error(404, 'Hittades inte');

	const result = await runWeb(
		event,
		Effect.gen(function* () {
			const bar = yield* ReviewStore.use((store) => store.findActiveBySlug(safeSlug));
			if (!bar) return null;
			const [availableUsers, priceComparison, nearbyComparison] = yield* Effect.all(
				[
					UserStore.use((users) => users.listAuthorOptions()),
					loadReviewPriceComparison(bar._id),
					loadNearbyReviewComparison(bar._id)
				],
				{ concurrency: 'unbounded' }
			);
			return {
				bar: serializeReview(bar),
				currentUsername: user.username,
				availableUsers,
				priceComparison,
				nearbyComparison
			};
		})
	);
	if (!result) error(404, 'Hittades inte');
	return result;
};

export const actions: Actions = {
	default: async (event) => {
		const { user } = event.locals;
		if (!user) {
			await runWeb(event, auditDenied('review_edit', 'unauthenticated_edit_action'));
			return failReviewForm(401, 'Du är inte inloggad');
		}

		const auditEdit = (outcome: 'attempt' | 'failure', targetSlug?: string, reason?: string) =>
			Effect.gen(function* () {
				const { ip } = yield* RequestContext;
				yield* audit({
					eventType: 'review_edit',
					outcome,
					username: user.username,
					ip,
					targetSlug,
					reason
				});
			});

		await runWeb(event, auditEdit('attempt'));
		const routeSlug = sanitizeSlug(decodeURIComponent(event.params.slug));
		if (!routeSlug.length || routeSlug.length > MAX_SLUG_LENGTH) {
			return failReviewForm(400, 'Ogiltig slug', '/slug');
		}

		let data: FormData;
		try {
			data = await event.request.formData();
		} catch (err) {
			console.error('Review form parse failed:', err);
			await runWeb(event, auditEdit('failure', routeSlug, 'form_parse_failed'));
			return failReviewForm(
				400,
				'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.'
			);
		}

		const result = await runWebAsUser(
			event,
			editReview(data, routeSlug).pipe(failReviewFormWith(data))
		);
		if ('slug' in result) redirect(303, `/${encodeURIComponent(result.slug)}`);
		return result;
	}
};
