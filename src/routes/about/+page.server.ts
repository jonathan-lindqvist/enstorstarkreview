import { fail } from '@sveltejs/kit';
import { Effect } from 'effect';
import { audit } from '$lib/server/audit';
import { RequestContext } from '$lib/server/request';
import { reviewRequestValues, submitReviewRequest } from '$lib/server/review-requests/submit';
import { httpStatusOf, messageOf } from '$lib/server/errors';
import { runWeb, formStatus } from '$lib/server/web';
import type { Actions } from './$types';

const auditRequest = (outcome: 'denied' | 'failure', reason: string) =>
	Effect.gen(function* () {
		const { ip } = yield* RequestContext;
		yield* audit({ eventType: 'review_request', outcome, ip, reason });
	});

export const actions: Actions = {
	requestReview: async (event) => {
		const { request, url } = event;
		if (request.headers.get('origin') !== url.origin) {
			await runWeb(event, auditRequest('denied', 'invalid_origin'));
			return fail(403, { success: false, message: 'Förfrågan kunde inte verifieras.' });
		}

		let data: FormData;
		try {
			data = await request.formData();
		} catch (error) {
			console.error('Review request form parse failed:', error);
			await runWeb(event, auditRequest('failure', 'form_parse_failed'));
			return fail(400, { success: false, message: 'Formuläret kunde inte läsas.' });
		}

		const result = await runWeb(
			event,
			submitReviewRequest(data).pipe(
				Effect.map((accepted) => ({ success: true as const, message: accepted.message })),
				Effect.catch((failure) =>
					httpStatusOf(failure) === undefined
						? Effect.die(failure)
						: Effect.succeed({ success: false as const, failure })
				)
			)
		);
		if (result.success) return result;

		const { failure } = result;
		if ('retryAfterSeconds' in failure && typeof failure.retryAfterSeconds === 'number') {
			event.setHeaders({ 'retry-after': String(failure.retryAfterSeconds) });
		}
		const fieldErrors =
			'errors' in failure && Array.isArray(failure.errors)
				? Object.fromEntries(
						failure.errors.map((error: { pointer: string; detail: string }) => [
							error.pointer.slice(1),
							error.detail
						])
					)
				: undefined;
		return fail(formStatus(failure), {
			success: false,
			message: messageOf(failure) ?? 'Något gick fel',
			values: reviewRequestValues(data),
			...(fieldErrors ? { fieldErrors } : {})
		});
	}
};
