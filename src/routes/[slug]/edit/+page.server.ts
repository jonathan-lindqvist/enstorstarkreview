import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { failReviewForm, failReviewFormProblem } from '$lib/server/reviews/response';
import { editReviewDependencies } from '$lib/server/reviews/production';
import { MAX_SLUG_LENGTH } from '$lib/server/reviews/form';
import { sanitizeSlug } from '$lib/utils/slug';
import { serializeReview } from '$lib/server/reviews/serialization';
import { editReview } from '$lib/server/reviews/edit';
import { loadReviewPriceComparison } from '$lib/server/reviews/price-comparison';

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

	const bar = await bars.findOne({ slug: safeSlug });
	if (!bar) throw error(404, 'Hittades inte');

	const allUsers = await users.find().toArray();
	const serializedUsers = allUsers.map((user) => ({
		_id: user._id.toString(),
		username: user.username
	}));

	return {
		bar: serializeReview(bar),
		currentUsername: locals.user.username,
		availableUsers: serializedUsers,
		priceComparison: await loadReviewPriceComparison(bar._id)
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, params } = event;
		const ip = getRequestIp(event);

		if (!locals.user) {
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'denied',
				ip,
				reason: 'unauthenticated_edit_action'
			});
			return failReviewForm(401, 'Du är inte inloggad');
		}
		const currentUsername = locals.user.username;

		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'attempt',
			username: currentUsername,
			ip
		});

		const decodedSlug = decodeURIComponent(params.slug);
		const routeSlug = sanitizeSlug(decodedSlug);
		if (!routeSlug.length || routeSlug.length > MAX_SLUG_LENGTH) {
			return failReviewForm(400, 'Ogiltig slug', '/slug');
		}

		let data: FormData;
		try {
			data = await request.formData();
		} catch (err) {
			console.error('Review form parse failed:', err);
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: routeSlug,
				reason: 'form_parse_failed'
			});
			return failReviewForm(
				400,
				'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.'
			);
		}

		const result = await editReview(
			data,
			routeSlug,
			{ username: currentUsername, ip },
			editReviewDependencies
		);
		if (!result.ok) return failReviewFormProblem(result.problem, result.formData);
		throw redirect(303, `/${encodeURIComponent(result.slug)}`);
	}
};
