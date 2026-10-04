import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { failReviewForm, failReviewFormProblem } from '$lib/server/reviews/response';
import { reviewWriteDependencies } from '$lib/server/reviews/production';
import { createDraftReview } from '$lib/server/reviews/create';
import type { CreateReviewDependencies } from '$lib/server/reviews/write-dependencies';

const dependencies: CreateReviewDependencies = {
	...reviewWriteDependencies,
	insertReview: (review) => bars.insertOne(review)
};

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

	const allUsers = await users.find().toArray();
	const serializedUsers = allUsers.map((user) => ({
		_id: user._id.toString(),
		username: user.username
	}));

	return {
		username: locals.user.username,
		availableUsers: serializedUsers
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		const ip = getRequestIp(event);
		const username = locals.user?.username ?? null;

		if (!locals.user) {
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'denied',
				ip,
				reason: 'unauthenticated_create_action'
			});
			return failReviewForm(401, 'Du är inte inloggad');
		}

		const currentUsername = locals.user.username;

		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'attempt',
			username,
			ip
		});

		let data: FormData;
		try {
			data = await request.formData();
		} catch (err) {
			console.error('Review form parse failed:', err);
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'form_parse_failed'
			});
			return failReviewForm(
				400,
				'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.'
			);
		}

		const result = await createDraftReview(data, { username: currentUsername, ip }, dependencies);
		if (!result.ok) return failReviewFormProblem(result.problem, result.formData);
		throw redirect(303, `/${encodeURIComponent(result.slug)}`);
	}
};
