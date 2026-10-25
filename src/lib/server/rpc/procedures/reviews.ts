import { z } from 'zod';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import { ACTIVE_REVIEW_FILTER, withReviewVisibility } from '$lib/server/review-publication';
import { createDraftReview } from '$lib/server/reviews/create';
import { deleteReview as deleteReviewWorkflow } from '$lib/server/reviews/delete';
import { editReview } from '$lib/server/reviews/edit';
import { buildReviewSearchFilter, sanitizeReviewSearch } from '$lib/server/reviews/listing';
import { publishReview as publishReviewWorkflow } from '$lib/server/reviews/publish';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import type { BarReview } from '$lib/types/bar-review';
import { sortReviews } from '$lib/utils/review-sort';
import { auditAttempt, authenticated, base, versionRequired } from '../base';
import type { RpcContext } from '../context';
import { problem, problems, reviewNotFound } from '../errors';
import { apiInput, jsonBody, WebForm } from '../input';
import { ifMatchMatches } from '../preconditions';
import { reviewETag, reviewPath, toApiReview, toApiReviewHistory } from '../representations';
import { reviewWriteProblem, toReviewFormData } from '../review-input';
import { doc, ETAG_HEADER, unvalidated, withResponseHeaders } from '../schema-docs';
import {
	Review,
	ReviewCreateRequest,
	ReviewHistory,
	ReviewList,
	ReviewSort,
	ReviewUpdateRequest
} from '../schemas';

const STALE_MESSAGE = 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.';

// Slugs are sanitized by parseRouteSlug; anything it rejects is simply not found.
const SlugParams = z.object({ slug: doc(z.string(), { minLength: 1, maxLength: 200 }) });

const ifMatchHeader = (description: string) =>
	z.object({ 'if-match': doc(z.string(), { description }) });

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** Reads the active review a write applies to, or fails as not found. */
const findActiveReview = async (context: RpcContext, routeSlug: string) => {
	const slug = parseRouteSlug(routeSlug);
	if (!slug) throw reviewNotFound();
	const review = await context.deps.reviews.findOne({ $and: [{ slug }, ACTIVE_REVIEW_FILTER] });
	if (!review) throw reviewNotFound();
	return { slug, review };
};

/** Compares the version the caller saw (`If-Match`) with the stored one. */
const requireCurrentVersion = (ifMatch: string, review: BarReview) => {
	if (!ifMatchMatches(ifMatch, reviewETag(review))) {
		throw problem('precondition_failed', STALE_MESSAGE);
	}
};

/** Reads the representation that a successful write returns, with its new version. */
const savedReview = async (context: RpcContext, slug: string) => {
	const review = await context.deps.reviews.findOne({ slug });
	if (!review) throw problem('internal_error', 'Kunde inte läsa den sparade recensionen');
	context.resHeaders?.set('etag', reviewETag(review));
	return toApiReview(review);
};

/** A web form is parsed only after authentication; a broken upload is audited. */
const readWebForm = async (
	form: WebForm,
	context: RpcContext,
	eventType: 'review_create' | 'review_edit',
	targetSlug?: string
) => {
	try {
		return await form.read();
	} catch (err) {
		console.error('Review form parse failed:', err);
		await context.deps.audit({
			eventType,
			outcome: 'failure',
			username: context.user?.username,
			ip: context.ip,
			targetSlug,
			reason: 'form_parse_failed'
		});
		throw problem(
			'bad_request',
			'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.',
			{ form: { status: 400, pointer: '/' } }
		);
	}
};

export const listReviews = base
	.meta({ auth: 'optional', cache: 'revalidate' })
	.route({
		method: 'GET',
		path: '/reviews',
		tags: ['Reviews'],
		operationId: 'listReviews',
		summary: 'List reviews.',
		description:
			'Anonymous clients get only published reviews. Authenticated clients also get drafts.\nThe search matches the title, location, description, beer brand and authors.\n',
		successDescription: 'Matching reviews in the requested order.'
	})
	.input(
		apiInput({
			// Lenient like the home page: long searches are shortened and unknown sorts fall back.
			query: z.object({
				search: z.preprocess(firstValue, doc(z.string(), { maxLength: 80 }).optional()),
				sort: ReviewSort.catch('latest')
			})
		})
	)
	.output(unvalidated(ReviewList))
	.handler(async ({ input, context }) => {
		const search = sanitizeReviewSearch(input.query.search);
		const reviews = await context.deps.reviews.find(
			withReviewVisibility(buildReviewSearchFilter(search), Boolean(context.user))
		);
		const sorted = sortReviews(reviews, input.query.sort, (review) => ({
			id: review._id.toString(),
			createdAt: review.createdAt,
			rating: review.rating
		}));
		return { reviews: sorted.map(toApiReview) };
	});

export const createReview = base
	.meta({ auth: 'required' })
	.route({
		method: 'POST',
		path: '/reviews',
		successStatus: 201,
		tags: ['Reviews'],
		operationId: 'createReview',
		summary: 'Create a draft review.',
		description:
			'New reviews are always drafts. Publish them with the publication endpoint.\nThe JSON body must be at most 22 MiB; decoded images must be at most 15 MiB.\n',
		successDescription: 'Draft created.',
		spec: withResponseHeaders('201', {
			Location: { description: 'API path of the new review.', schema: { type: 'string' } },
			...ETAG_HEADER
		})
	})
	.errors(
		problems(
			'bad_request',
			'unauthorized',
			'duplicate_slug',
			'payload_too_large',
			'unsupported_media_type',
			'validation_failed',
			'internal_error'
		)
	)
	.use(
		authenticated({
			eventType: 'review_create',
			reason: { web: 'unauthenticated_create_action', api: 'unauthenticated_api_create' }
		})
	)
	.use(auditAttempt('review_create'))
	.input(apiInput({ body: jsonBody(ReviewCreateRequest, { webForm: true }) }))
	.output(unvalidated(Review))
	.handler(async ({ input, context }) => {
		const { body } = input;
		const data =
			body instanceof WebForm
				? await readWebForm(body, context, 'review_create')
				: toReviewFormData(body);

		const result = await createDraftReview(
			data,
			{ username: context.user.username, ip: context.ip },
			context.deps.reviews.create
		);
		if (!result.ok) throw reviewWriteProblem(result.problem, result.formData, context.channel);

		context.resHeaders?.set('location', reviewPath(result.slug));
		return savedReview(context, result.slug);
	});

export const getReview = base
	.meta({ auth: 'optional', cache: 'revalidate' })
	.route({
		method: 'GET',
		path: '/reviews/{slug}',
		tags: ['Reviews'],
		operationId: 'getReview',
		summary: 'Get one review.',
		description: 'Drafts return 404 to anonymous clients.',
		successDescription: 'The review.'
	})
	.errors(problems('not_found'))
	.input(apiInput({ params: SlugParams }))
	.output(unvalidated(Review))
	.handler(async ({ input, context }) => {
		const slug = parseRouteSlug(input.params.slug);
		if (!slug) throw reviewNotFound();
		const review = await context.deps.reviews.findOne(
			withReviewVisibility({ slug }, Boolean(context.user))
		);
		if (!review) throw reviewNotFound();
		context.resHeaders?.set('etag', reviewETag(review));
		return toApiReview(review);
	});

export const updateReview = base
	.meta({ auth: 'required' })
	.route({
		method: 'PUT',
		path: '/reviews/{slug}',
		tags: ['Reviews'],
		operationId: 'updateReview',
		summary: 'Replace the editable fields of a review.',
		description:
			"Any reviewer may edit any review. Send every editable field; omit `image` to keep the\ncurrent photo and `attributes` to keep the current attributes. The publication status is never changed. The slug may change, so use\nthe returned review's `slug` afterwards.\nThe JSON body must be at most 22 MiB. If-Match requires a current strong entity tag;\nwildcard and weak-only preconditions return 412 and never permit an unconditional overwrite.\n",
		successDescription: 'Review updated.',
		spec: withResponseHeaders('200', ETAG_HEADER)
	})
	.errors(
		problems(
			'bad_request',
			'unauthorized',
			'not_found',
			'concurrent_update',
			'precondition_failed',
			'payload_too_large',
			'unsupported_media_type',
			'validation_failed',
			'precondition_required',
			'internal_error'
		)
	)
	.use(
		authenticated({
			eventType: 'review_edit',
			reason: { web: 'unauthenticated_edit_action', api: 'unauthenticated_api_edit' }
		})
	)
	.use(auditAttempt('review_edit'))
	.use(versionRequired('Ange versionen av recensionen (If-Match) för att ändra den.'))
	.input(
		apiInput({
			params: SlugParams,
			headers: ifMatchHeader(
				'The strong `ETag` from the last read of this review. A list is accepted when it\ncontains the current strong tag. Wildcards are rejected, even in a list; weak\ntags never match. A missing header returns 428, a nonmatching header returns 412.\n'
			),
			body: jsonBody(ReviewUpdateRequest, { webForm: true })
		})
	)
	.output(unvalidated(Review))
	.handler(async ({ input, context }) => {
		const { slug, review: existing } = await findActiveReview(context, input.params.slug);
		requireCurrentVersion(input.headers['if-match'], existing);

		const { body } = input;
		// The web form names its review; the workflow checks that it matches the route slug.
		// `existing` matches If-Match and the edit writes only that version, so kept
		// attributes and sizes cannot overwrite a parallel change.
		const data =
			body instanceof WebForm
				? await readWebForm(body, context, 'review_edit', slug)
				: toReviewFormData(body, {
						id: existing._id.toHexString(),
						currentAttributes: normalizeBarAttributes(existing.attributes),
						currentBeerVolumeCl: existing.beerVolumeCl
					});

		const result = await editReview(
			data,
			slug,
			{
				username: context.user.username,
				ip: context.ip,
				expectedUpdatedAt: new Date(existing.updatedAt)
			},
			context.deps.reviews.edit
		);
		if (!result.ok) throw reviewWriteProblem(result.problem, result.formData, context.channel);
		return savedReview(context, result.slug);
	});

export const deleteReview = base
	.meta({ auth: 'required' })
	.route({
		method: 'DELETE',
		path: '/reviews/{slug}',
		successStatus: 204,
		tags: ['Reviews'],
		operationId: 'deleteReview',
		summary: 'Delete a review.',
		description:
			'Any reviewer may delete any review, draft or published, like on the web. The review is\nhidden from every reader afterwards; its history and photo stay on the server, and\ncopies that browsers or shared caches already hold can remain. A deleted review returns\n404 everywhere, including a second delete. If-Match requires a current strong entity tag,\nso a review that changed since the client read it is never deleted.\n',
		successDescription: 'Review deleted.'
	})
	.errors(
		problems(
			'unauthorized',
			'not_found',
			'concurrent_update',
			'precondition_failed',
			'precondition_required',
			'internal_error'
		)
	)
	.use(
		authenticated({
			eventType: 'review_delete',
			reason: { web: 'unauthenticated_delete', api: 'unauthenticated_api_delete' },
			targetSlug: true
		})
	)
	.use(versionRequired('Ange versionen av recensionen (If-Match) för att ta bort den.'))
	.input(
		apiInput({
			params: SlugParams,
			headers: ifMatchHeader(
				'The strong `ETag` from the last read of this review. Wildcards and weak tags are\nrejected. A missing header returns 428, a nonmatching header returns 412.\n'
			)
		})
	)
	.output(unvalidated(z.void()))
	.handler(async ({ input, context }) => {
		const { slug, review } = await findActiveReview(context, input.params.slug);
		requireCurrentVersion(input.headers['if-match'], review);

		// The stored version is checked again inside the atomic soft delete.
		const result = await deleteReviewWorkflow(
			slug,
			{
				username: context.user.username,
				ip: context.ip,
				expectedUpdatedAt: new Date(review.updatedAt)
			},
			context.deps.reviews.delete
		);
		if (!result.ok) {
			throw problem(
				result.code === 'storage_failed' ? 'internal_error' : result.code,
				result.message
			);
		}
	});

export const publishReview = base
	.meta({ auth: 'required' })
	.route({
		method: 'POST',
		path: '/reviews/{slug}/publication',
		tags: ['Reviews'],
		operationId: 'publishReview',
		summary: 'Publish a draft review.',
		description: 'Publication is one-way and keeps the credited authors.',
		successDescription: 'The published review.',
		spec: withResponseHeaders('200', ETAG_HEADER)
	})
	.errors(problems('unauthorized', 'not_found', 'already_published', 'internal_error'))
	.use(
		authenticated({
			eventType: 'review_publish',
			reason: { web: 'unauthenticated_publish', api: 'unauthenticated_api_publish' },
			targetSlug: true
		})
	)
	.input(apiInput({ params: SlugParams }))
	.output(unvalidated(Review))
	.handler(async ({ input, context }) => {
		const result = await publishReviewWorkflow(
			parseRouteSlug(input.params.slug),
			{ username: context.user.username, ip: context.ip },
			context.deps.reviews.publish
		);
		if (!result.ok) {
			throw problem(
				result.code === 'storage_failed' ? 'internal_error' : result.code,
				result.message
			);
		}
		return savedReview(context, result.slug);
	});

export const getReviewHistory = base
	.meta({ auth: 'optional', cache: 'revalidate' })
	.route({
		method: 'GET',
		path: '/reviews/{slug}/history',
		tags: ['Reviews'],
		operationId: 'getReviewHistory',
		summary: 'Get the change history of a review, newest first.',
		successDescription: 'The change history.'
	})
	.errors(problems('not_found'))
	.input(apiInput({ params: SlugParams }))
	.output(unvalidated(ReviewHistory))
	.handler(async ({ input, context }) => {
		const slug = parseRouteSlug(input.params.slug);
		if (!slug) throw reviewNotFound();
		const review = await context.deps.reviews.findOne(
			withReviewVisibility({ slug }, Boolean(context.user))
		);
		if (!review) throw reviewNotFound();
		return toApiReviewHistory(review);
	});
