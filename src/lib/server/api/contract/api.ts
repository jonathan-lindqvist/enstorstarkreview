import { Context, Schema } from 'effect';
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiMiddleware,
	HttpApiSchema,
	HttpApiSecurity,
	OpenApi
} from 'effect/http-api';
import { CurrentUser, Viewer } from '$lib/server/request';
import {
	NearbyReviews,
	Problem,
	Review,
	ReviewCreateRequest,
	ReviewHistory,
	ReviewList,
	ReviewMap,
	ReviewMetadata,
	ReviewRequestAccepted,
	ReviewRequestCreateRequest,
	ReviewSort,
	ReviewStatistics,
	ReviewUpdateRequest,
	Session,
	SessionCreateRequest,
	SessionCreated,
	UserList
} from './schemas';

/**
 * The `/api/v1` HTTP contract. `openapi/v1.yaml` is generated from this definition
 * (`npm run api:generate`), and `server/api/server.ts` serves it. Handlers live in
 * `server/api/handlers/`; they call the same workflows as the web routes.
 */

/** Endpoint annotation: the audit event written when an anonymous client is turned away. */
export class DeniedAudit extends Context.Service<
	DeniedAudit,
	{ readonly eventType: string; readonly reason: string }
>()('enstorstark/api/DeniedAudit') {}

export type DocumentedHeader = 'ETag' | 'Location' | 'Retry-After';

/**
 * Endpoint annotation: response descriptions and headers to document, by status. Statuses
 * without an entry use the shared descriptions in `server/api/openapi.ts`. Descriptions live
 * here rather than on the schemas, so every response reuses one component per schema.
 */
export class Responses extends Context.Service<
	Responses,
	Readonly<
		Record<
			number,
			{ readonly description?: string; readonly headers?: readonly DocumentedHeader[] }
		>
	>
>()('enstorstark/api/Responses') {}

/**
 * Reads an optional bearer token into `Viewer`. Public endpoints use it for draft visibility.
 * The web session cookie is never read on the API.
 */
export class OptionalAuthentication extends HttpApiMiddleware.Service<
	OptionalAuthentication,
	{ provides: Viewer }
>()('enstorstark/api/OptionalAuthentication') {}

/**
 * Requires a valid bearer token and provides `CurrentUser` (and `Viewer`). Missing or invalid
 * tokens get a 401 problem before the request body is read.
 */
export class Authentication extends HttpApiMiddleware.Service<
	Authentication,
	{ provides: CurrentUser | Viewer }
>()('enstorstark/api/Authentication', {
	security: { bearerAuth: HttpApiSecurity.bearer }
}) {}

/** A problem+json error response with the given status, for the generated contract. */
const problem = (status: number) =>
	Problem.pipe(
		HttpApiSchema.status(status),
		HttpApiSchema.asJson({ contentType: 'application/problem+json' })
	);

const BadRequest = problem(400);
const Unauthorized = problem(401);
const NotFound = problem(404);
const Conflict = problem(409);
const PreconditionFailed = problem(412);
const PayloadTooLarge = problem(413);
const UnsupportedMediaType = problem(415);
const ValidationFailed = problem(422);
const PreconditionRequired = problem(428);
const RateLimited = problem(429);
const InternalError = problem(500);
const BadGateway = problem(502);
const ServiceUnavailable = problem(503);
const NotModified = HttpApiSchema.Empty(304);

const SlugParams = { slug: Schema.String };
// Optional for decoding, so a missing header reaches the handler and answers 428 rather than a
// generic 400; the generated contract marks it required.
const IfMatch = Schema.Struct({
	'if-match': Schema.optionalKey(Schema.String).annotate({
		description:
			'The strong `ETag` from the last read of this review. A list is accepted when it contains the current strong tag. Wildcards are rejected, even in a list; weak tags never match. A missing header returns 428, a nonmatching header returns 412.'
	})
});
/** Public endpoints that never need a token. */
const publicOnly = { security: [{}] } as const;

export const SessionsGroup = HttpApiGroup.make('sessions', { topLevel: true })
	.add(
		HttpApiEndpoint.post('createSession', '/sessions', {
			payload: SessionCreateRequest,
			success: SessionCreated.pipe(HttpApiSchema.status(201)),
			error: [
				BadRequest,
				Unauthorized,
				PayloadTooLarge,
				UnsupportedMediaType,
				ValidationFailed,
				RateLimited
			]
		})
			.annotate(OpenApi.Summary, 'Sign in with a username and password.')
			.annotate(
				OpenApi.Description,
				'Uses the same credential checks, rate limits (per IP and per username) and audit events as the web login. The token is a session identifier with a 30-day sliding expiry: every authenticated request in the second half of its lifetime extends it. The IP limit is consumed before body parsing, including malformed requests. The JSON body must be at most 16 KiB; structurally valid bodies also consume the username limit.'
			)
			.annotate(OpenApi.Override, publicOnly)
			.annotate(Responses, {
				201: { description: 'Signed in.' },
				401: { description: 'Wrong username or password.' },
				429: { headers: ['Retry-After'] }
			}),
		HttpApiEndpoint.get('getCurrentSession', '/sessions/current', {
			success: Session,
			error: Unauthorized
		})
			.annotate(Responses, { 200: { description: 'The current session.' } })
			.middleware(Authentication)
			.annotate(OpenApi.Summary, 'Get the signed-in user and the token expiry.'),
		HttpApiEndpoint.delete('deleteCurrentSession', '/sessions/current', {
			success: HttpApiSchema.NoContent,
			error: Unauthorized
		})
			.annotate(Responses, { 204: { description: 'Signed out.' } })
			.middleware(Authentication)
			.annotate(OpenApi.Summary, 'Sign out and invalidate the token.')
	)
	.annotate(OpenApi.Title, 'Sessions');

export const MetadataGroup = HttpApiGroup.make('metadata', { topLevel: true })
	.add(
		HttpApiEndpoint.get('getReviewMetadata', '/review-metadata', {
			success: [ReviewMetadata, NotModified]
		})
			.middleware(OptionalAuthentication)
			.annotate(
				OpenApi.Summary,
				'Rating aspects, overall-rating rules, beer brands and input limits.'
			)
			.annotate(
				OpenApi.Description,
				'Clients render rating labels and build the review form from this data.'
			)
			.annotate(OpenApi.Override, publicOnly)
			.annotate(Responses, { 200: { description: 'Review metadata.', headers: ['ETag'] } }),
		HttpApiEndpoint.get('listUsers', '/users', {
			success: UserList,
			error: Unauthorized
		})
			.annotate(Responses, { 200: { description: 'Reviewers, sorted with Swedish collation.' } })
			.middleware(Authentication)
			.annotate(OpenApi.Summary, 'List reviewer usernames for the author picker.')
	)
	.annotate(OpenApi.Title, 'Metadata');

export const ReviewsGroup = HttpApiGroup.make('reviews', { topLevel: true })
	.add(
		HttpApiEndpoint.get('listReviews', '/reviews', {
			query: {
				search: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
				sort: Schema.optionalKey(ReviewSort)
			},
			success: [ReviewList, NotModified]
		})
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'List reviews.')
			.annotate(
				OpenApi.Description,
				'Anonymous clients get only published reviews. Authenticated clients also get drafts. The search matches the title, location, description, beer brand and authors.'
			)
			.annotate(Responses, {
				200: { description: 'Matching reviews in the requested order.', headers: ['ETag'] }
			}),
		HttpApiEndpoint.post('createReview', '/reviews', {
			payload: ReviewCreateRequest,
			success: Review.pipe(HttpApiSchema.status(201)),
			error: [
				BadRequest,
				Unauthorized,
				Conflict,
				PayloadTooLarge,
				UnsupportedMediaType,
				ValidationFailed,
				InternalError
			]
		})
			.middleware(Authentication)
			.annotate(DeniedAudit, { eventType: 'review_create', reason: 'unauthenticated_api_create' })
			.annotate(OpenApi.Summary, 'Create a draft review.')
			.annotate(
				OpenApi.Description,
				'New reviews are always drafts. Publish them with the publication endpoint. The JSON body must be at most 22 MiB; decoded images must be at most 15 MiB.'
			)
			.annotate(Responses, {
				201: { description: 'Draft created.', headers: ['Location', 'ETag'] }
			}),
		HttpApiEndpoint.get('getReview', '/reviews/:slug', {
			params: SlugParams,
			success: [Review, NotModified],
			error: NotFound
		})
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'Get one review.')
			.annotate(OpenApi.Description, 'Drafts return 404 to anonymous clients.')
			.annotate(Responses, { 200: { description: 'The review.', headers: ['ETag'] } }),
		HttpApiEndpoint.put('updateReview', '/reviews/:slug', {
			params: SlugParams,
			headers: IfMatch,
			payload: ReviewUpdateRequest,
			success: Review,
			error: [
				BadRequest,
				Unauthorized,
				NotFound,
				Conflict,
				PreconditionFailed,
				PayloadTooLarge,
				UnsupportedMediaType,
				ValidationFailed,
				PreconditionRequired,
				InternalError
			]
		})
			.middleware(Authentication)
			.annotate(DeniedAudit, { eventType: 'review_edit', reason: 'unauthenticated_api_edit' })
			.annotate(OpenApi.Summary, 'Replace the editable fields of a review.')
			.annotate(
				OpenApi.Description,
				"Any reviewer may edit any review. Send every editable field; omit `image` to keep the current photo and `attributes` to keep the current attributes. The publication status is never changed. The slug may change, so use the returned review's `slug` afterwards. The JSON body must be at most 22 MiB. If-Match requires a current strong entity tag; wildcard and weak-only preconditions return 412 and never permit an unconditional overwrite."
			)
			.annotate(Responses, { 200: { description: 'Review updated.', headers: ['ETag'] } }),
		HttpApiEndpoint.delete('deleteReview', '/reviews/:slug', {
			params: SlugParams,
			headers: IfMatch,
			success: HttpApiSchema.NoContent,
			error: [
				Unauthorized,
				NotFound,
				Conflict,
				PreconditionFailed,
				PreconditionRequired,
				InternalError
			]
		})
			.annotate(Responses, { 204: { description: 'Review deleted.' } })
			.middleware(Authentication)
			.annotate(DeniedAudit, { eventType: 'review_delete', reason: 'unauthenticated_api_delete' })
			.annotate(OpenApi.Summary, 'Delete a review.')
			.annotate(
				OpenApi.Description,
				'Any reviewer may delete any review, draft or published, like on the web. The review is hidden from every reader afterwards; its history and photo stay on the server, and copies that browsers or shared caches already hold can remain. A deleted review returns 404 everywhere, including a second delete. If-Match requires a current strong entity tag, so a review that changed since the client read it is never deleted.'
			),
		HttpApiEndpoint.post('publishReview', '/reviews/:slug/publication', {
			params: SlugParams,
			success: Review,
			error: [Unauthorized, NotFound, Conflict, InternalError]
		})
			.middleware(Authentication)
			.annotate(DeniedAudit, {
				eventType: 'review_publish',
				reason: 'unauthenticated_api_publish'
			})
			.annotate(OpenApi.Summary, 'Publish a draft review.')
			.annotate(OpenApi.Description, 'Publication is one-way and keeps the credited authors.')
			.annotate(Responses, { 200: { description: 'The published review.', headers: ['ETag'] } }),
		HttpApiEndpoint.get('getReviewHistory', '/reviews/:slug/history', {
			params: SlugParams,
			success: ReviewHistory,
			error: NotFound
		})
			.annotate(Responses, { 200: { description: 'The change history.' } })
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'Get the change history of a review, newest first.'),
		HttpApiEndpoint.get('getNearbyReviews', '/nearby-reviews', {
			query: {
				address: Schema.String,
				exclude: Schema.optionalKey(Schema.String)
			},
			success: NearbyReviews,
			error: [BadRequest, Unauthorized, NotFound, ServiceUnavailable]
		})
			.annotate(Responses, { 200: { description: 'The comparison.' } })
			.middleware(Authentication)
			.annotate(OpenApi.Summary, 'Count reviewed bars near an address, for the barhop rating.')
			.annotate(
				OpenApi.Description,
				"The same comparison as the web review form, beside the barhop rating. The center is the saved position of another review with the same address (compared case-insensitively after whitespace cleanup); the server never geocodes a new address and never accepts a device location. Counts include drafts, so the endpoint requires a token. When editing, pass the review's slug as `exclude`: that review is left out of the counts, but its own saved address can still be the center. Distances are approximate, as the crow flies."
			)
	)
	.annotate(OpenApi.Title, 'Reviews');

export const ImagesGroup = HttpApiGroup.make('images', { topLevel: true })
	.add(
		HttpApiEndpoint.get('getImage', '/images/:filename', {
			params: { filename: Schema.String },
			query: {
				preview: Schema.optionalKey(
					Schema.Literals(['card-v1', 'detail-v1']).annotate({
						description: 'Give at most once. Any other value is `400` with code `bad_request`.'
					})
				)
			},
			success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: 'image/webp' })),
			error: [BadRequest, NotFound, ServiceUnavailable]
		})
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'Download a review photo.')
			.annotate(
				OpenApi.Description,
				'Use the `image.url` of a review instead of building this path. Images of drafts need authentication. Published images are immutable and can be cached forever.\n\nWithout `preview`, the response is the original upload, which can be several megabytes and tens of megapixels. Lists and detail screens should request a preview: a WebP scaled to at most 768 (`card-v1`) or 1280 (`detail-v1`) pixels wide, never enlarged. A preview has the same access rules and cache headers as the original.'
			)
			.annotate(Responses, {
				200: { description: 'The image bytes. A preview is always `image/webp`.' },
				400: { description: 'The `preview` value is unknown or given more than once.' },
				503: {
					description: 'Too many previews are being generated. Retry after the given time.',
					headers: ['Retry-After']
				}
			})
	)
	.annotate(OpenApi.Title, 'Images');

export const MapGroup = HttpApiGroup.make('map', { topLevel: true })
	.add(
		HttpApiEndpoint.get('getMap', '/map', {
			success: [ReviewMap, NotModified]
		})
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'Get map markers for published reviews with known coordinates.')
			.annotate(
				OpenApi.Description,
				"Coordinates come from the server's geocode cache. A review without a resolved address has no marker. Clients must never send the device location to this API."
			)
			.annotate(OpenApi.Override, publicOnly)
			.annotate(Responses, { 200: { description: 'Map markers.', headers: ['ETag'] } }),
		HttpApiEndpoint.post('resolveNextMapMarker', '/map/geocoding', {
			success: [ReviewMap, HttpApiSchema.NoContent],
			error: Unauthorized
		})
			.annotate(Responses, {
				200: { description: 'A new marker was resolved. Returns the updated map.' },
				204: { description: 'No marker was resolved.' }
			})
			.middleware(Authentication)
			.annotate(OpenApi.Summary, 'Geocode at most one published review address that has no marker.')
			.annotate(
				OpenApi.Description,
				'Reviewers call this after the map is shown. The server makes at most one address attempt per call and returns 204 when there is nothing to do or another attempt is active.'
			)
	)
	.annotate(OpenApi.Title, 'Map');

export const StatisticsGroup = HttpApiGroup.make('statistics', { topLevel: true })
	.add(
		HttpApiEndpoint.get('getStatistics', '/statistics', {
			success: [ReviewStatistics, NotModified]
		})
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'Get statistics for published reviews.')
			.annotate(OpenApi.Override, publicOnly)
			.annotate(Responses, { 200: { description: 'Statistics.', headers: ['ETag'] } })
	)
	.annotate(OpenApi.Title, 'Statistics');

export const ReviewRequestsGroup = HttpApiGroup.make('reviewRequests', { topLevel: true })
	.add(
		HttpApiEndpoint.post('createReviewRequest', '/review-requests', {
			payload: ReviewRequestCreateRequest,
			success: ReviewRequestAccepted.pipe(HttpApiSchema.status(202)),
			error: [
				BadRequest,
				PayloadTooLarge,
				UnsupportedMediaType,
				ValidationFailed,
				RateLimited,
				BadGateway,
				ServiceUnavailable
			]
		})
			.middleware(OptionalAuthentication)
			.annotate(OpenApi.Summary, 'Ask the reviewers to review a bar.')
			.annotate(
				OpenApi.Description,
				'Uses the same validation, rate limits and Discord delivery as the web form. The IP quota is consumed before parsing, including malformed requests. The JSON body must be at most 16 KiB. Only valid submissions consume the global delivery quota.'
			)
			.annotate(OpenApi.Override, publicOnly)
			.annotate(Responses, {
				202: { description: 'The request was accepted for the reviewers.' },
				429: { headers: ['Retry-After'] }
			})
	)
	.annotate(OpenApi.Title, 'Review requests');

export const EnStorStarkApi = HttpApi.make('enstorstark')
	.add(SessionsGroup)
	.add(MetadataGroup)
	.add(ReviewsGroup)
	.add(ImagesGroup)
	.add(MapGroup)
	.add(StatisticsGroup)
	.add(ReviewRequestsGroup)
	.prefix('/api/v1')
	.annotate(OpenApi.Title, 'En stor stark API')
	.annotate(OpenApi.Version, '1.0.0')
	.annotate(OpenApi.Summary, 'JSON API for the native En stor stark clients.')
	.annotate(
		OpenApi.Description,
		"Readers use the public endpoints without authentication. Reviewers sign in with\n`POST /sessions` and send the returned token as `Authorization: Bearer <token>`.\n\nThe API never reads the web session cookie. Authentication requires an explicit bearer\ntoken rather than ambient browser cookies. Request bodies are JSON; image downloads\nreturn image bytes, and some operations have no request or response body.\n\nUser-facing messages (`detail`, `errors[].detail`) are Swedish and are safe to show to\nthe user. Clients branch on `code` and HTTP status, never on message text.\n\nPublic collection and detail responses include an `ETag`; send `If-None-Match` to get\n`304 Not Modified`. Review updates require `If-Match` with the review's current `ETag`.\n"
	);
