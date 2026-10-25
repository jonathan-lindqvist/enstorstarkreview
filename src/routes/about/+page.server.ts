import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { isProcedureError } from '$lib/server/rpc/errors';
import { WebForm } from '$lib/server/rpc/input';
import { webClient } from '$lib/server/rpc/web';

export const actions: Actions = {
	requestReview: async (event) => {
		const { request, url } = event;
		const ip = getRequestIp(event);
		const origin = request.headers.get('origin');

		// Same-origin check for the cookie-bearing web form; the API has no ambient credentials.
		if (origin !== url.origin) {
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'denied',
				ip,
				reason: 'invalid_origin'
			});
			return fail(403, { success: false, message: 'Förfrågan kunde inte verifieras.' });
		}

		let data: FormData;
		try {
			data = await request.formData();
		} catch (error) {
			console.error('Review request form parse failed:', error);
			await logAuditEvent({
				eventType: 'review_request',
				outcome: 'failure',
				ip,
				reason: 'form_parse_failed'
			});
			return fail(400, { success: false, message: 'Formuläret kunde inte läsas.' });
		}

		try {
			const { message } = await webClient(event).reviewRequests.create({
				body: WebForm.of(data)
			});
			return { success: true, message };
		} catch (cause) {
			if (!isProcedureError(cause)) throw cause;
			const retryAfter = cause.data?.headers?.['retry-after'];
			if (retryAfter !== undefined) event.setHeaders({ 'retry-after': retryAfter });
			return fail(cause.data?.form?.status ?? cause.status, {
				success: false,
				message: cause.message,
				...cause.data?.form?.values
			});
		}
	}
};
