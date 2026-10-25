import {
	admitReviewRequestIp,
	submitReviewRequest,
	type ReviewRequestIpAdmission,
	type ReviewRequestResult
} from '$lib/server/review-requests/submit';
import { auditInvalidBody, base } from '../base';
import { problem, problems } from '../errors';
import { apiInput, jsonBody, WebForm } from '../input';
import { unvalidated, withResponses } from '../schema-docs';
import { ReviewRequestAccepted, ReviewRequestCreateRequest } from '../schemas';

type ReviewRequestFailure = Extract<ReviewRequestResult, { ok: false }>;

const reviewRequestProblem = ({ status, data, retryAfterSeconds }: ReviewRequestFailure) => {
	const { message, values, fieldErrors } = data;
	// The web form shows the message, field errors and the submitted values again.
	const form = { status, pointer: '/', values: { values, fieldErrors } };
	if (status === 400) {
		return problem('validation_failed', message, {
			errors: Object.entries(fieldErrors ?? {}).map(([field, detail]) => ({
				pointer: `/${field}`,
				detail: detail ?? message
			})),
			form
		});
	}
	if (status === 429) {
		return problem('rate_limited', message, {
			headers: retryAfterSeconds === undefined ? {} : { 'retry-after': String(retryAfterSeconds) },
			form
		});
	}
	return problem('service_unavailable', message, { form }, { status });
};

/**
 * The API consumes the IP quota before reading the body, including malformed ones. The web form
 * keeps its order (honeypot and validation first), so the workflow admits it with its values.
 */
const admitApiRequest = base.middleware(async ({ context, next }) => {
	let admission: ReviewRequestIpAdmission | undefined;
	if (context.channel === 'api') {
		const result = await admitReviewRequestIp(context.ip, context.deps.reviewRequests);
		if (!result.ok) throw reviewRequestProblem(result);
		admission = result;
	}
	return next({ context: { reviewRequestAdmission: admission } });
});

export const createReviewRequest = base
	.meta({ auth: 'none' })
	.route({
		method: 'POST',
		path: '/review-requests',
		successStatus: 202,
		tags: ['Review requests'],
		operationId: 'createReviewRequest',
		summary: 'Ask the reviewers to review a bar.',
		description:
			'Uses the same validation, rate limits and Discord delivery as the web form.\nThe IP quota is consumed before parsing, including malformed requests. The JSON\nbody must be at most 16 KiB. Only valid submissions consume the global delivery quota.\n',
		successDescription: 'The request was accepted for the reviewers.',
		// Delivery failures are 502, a missing webhook configuration 503; both are retryable.
		spec: withResponses({ '502': { $ref: '#/components/responses/ServiceUnavailable' } as never })
	})
	.errors(
		problems(
			'bad_request',
			'payload_too_large',
			'unsupported_media_type',
			'validation_failed',
			'rate_limited',
			'service_unavailable'
		)
	)
	.use(admitApiRequest)
	.use(auditInvalidBody({ eventType: 'review_request' }))
	.input(apiInput({ body: jsonBody(ReviewRequestCreateRequest, { webForm: true }) }))
	.output(unvalidated(ReviewRequestAccepted))
	.handler(async ({ input, context }) => {
		const { body } = input;
		let data: FormData;
		if (body instanceof WebForm) {
			data = await body.read();
		} else {
			// The web form's honeypot does not apply to native clients; the rate limits still do.
			data = new FormData();
			data.set('barName', body.barName);
			data.set('location', body.location);
			data.set('motivation', body.motivation ?? '');
		}

		const result = await submitReviewRequest(data, context.ip, context.deps.reviewRequests, {
			ipAdmission: context.reviewRequestAdmission
		});
		if (!result.ok) throw reviewRequestProblem(result);
		return { message: result.data.message };
	});
