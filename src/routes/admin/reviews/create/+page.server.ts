import { redirect } from '@sveltejs/kit';
import { Effect } from 'effect';
import { audit } from '$lib/server/audit';
import { RequestContext } from '$lib/server/request';
import { createDraftReview } from '$lib/server/reviews/create';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import { loadReviewPriceComparison } from '$lib/server/reviews/price-comparison';
import { failReviewForm, failReviewFormWith } from '$lib/server/reviews/response';
import { UserStore } from '$lib/server/users';
import { auditDenied, runWeb, runWebAsUser } from '$lib/server/web';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user } = event.locals;
	if (!user) {
		await runWeb(event, auditDenied('review_create', 'unauthenticated_create_page_access'));
		redirect(302, '/login');
	}

	return runWeb(
		event,
		Effect.gen(function* () {
			const [availableUsers, priceComparison, nearbyComparison] = yield* Effect.all(
				[
					UserStore.use((users) => users.listAuthorOptions()),
					loadReviewPriceComparison(),
					loadNearbyReviewComparison()
				],
				{ concurrency: 'unbounded' }
			);
			return { username: user.username, availableUsers, priceComparison, nearbyComparison };
		})
	);
};

export const actions: Actions = {
	default: async (event) => {
		const { user } = event.locals;
		if (!user) {
			await runWeb(event, auditDenied('review_create', 'unauthenticated_create_action'));
			return failReviewForm(401, 'Du är inte inloggad');
		}

		const auditCreate = (outcome: 'attempt' | 'failure', reason?: string) =>
			Effect.gen(function* () {
				const { ip } = yield* RequestContext;
				yield* audit({ eventType: 'review_create', outcome, username: user.username, ip, reason });
			});

		await runWeb(event, auditCreate('attempt'));
		let data: FormData;
		try {
			data = await event.request.formData();
		} catch (err) {
			console.error('Review form parse failed:', err);
			await runWeb(event, auditCreate('failure', 'form_parse_failed'));
			return failReviewForm(
				400,
				'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.'
			);
		}

		const result = await runWebAsUser(
			event,
			createDraftReview(data).pipe(failReviewFormWith(data))
		);
		if ('slug' in result) redirect(303, `/${encodeURIComponent(result.slug)}`);
		return result;
	}
};
