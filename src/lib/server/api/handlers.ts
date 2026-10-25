import { Context, Effect, Layer, Option } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import { MAX_SHORT_TEXT } from '$lib/constants';
import { normalizeReviewSort, sortReviews } from '$lib/utils/review-sort';
import { audit, AuditLog } from '$lib/server/audit';
import { Sessions, readBearerToken } from '$lib/server/auth';
import {
	BadRequest,
	PreconditionRequired,
	ReviewNotFound,
	ServiceUnavailable,
	StorageFailed
} from '$lib/server/errors';
import { admitLoginIp, loginWithPassword } from '$lib/server/login/login';
import { ReviewMap } from '$lib/server/map/service';
import { readReviewImage } from '$lib/server/review-image-response';
import { admitReviewRequestIp, submitReviewRequest } from '$lib/server/review-requests/submit';
import { ReviewStatistics } from '$lib/server/review-statistics';
import { CurrentUser, RequestContext, Viewer, type AuthenticatedUser } from '$lib/server/request';
import { createDraftReview } from '$lib/server/reviews/create';
import { deleteReview } from '$lib/server/reviews/delete';
import { editReview } from '$lib/server/reviews/edit';
import { buildReviewSearchFilter, sanitizeReviewSearch } from '$lib/server/reviews/listing';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import { publishReview } from '$lib/server/reviews/publish';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import { ReviewStore } from '$lib/server/reviews/store';
import { UserStore } from '$lib/server/users';
import {
	Authentication,
	DeniedAudit,
	EnStorStarkApi,
	OptionalAuthentication
} from './contract/api';
import { cachedJsonResponse, checkIfMatch, jsonResponse, readJsonBody } from './http';
import { buildReviewMetadata } from './metadata';
import { toApiNearbyReviews } from './nearby-reviews';
import { problemFromError, unauthorizedProblem } from './problem';
import { toApiReviewError, toReviewFormData } from './review-input';
import { reviewETag, reviewPath, toApiReview, toApiReviewHistory, toApiReviewMap } from './reviews';

/** Renders every domain failure of a handler as a problem response. */
const respond = <E, R>(
	effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
	effect.pipe(Effect.catch((error) => Effect.succeed(problemFromError(error))));

const webRequest = (request: HttpServerRequest.HttpServerRequest): Request =>
	request.source as Request;

const searchParams = (request: HttpServerRequest.HttpServerRequest) =>
	new URL(webRequest(request).url).searchParams;

const viewerFromValidation = (
	user: { id: string; username: string } | null,
	session: { id: string; expiresAt: Date } | null
) =>
	user && session
		? Viewer.of({
				user: Option.some<AuthenticatedUser>({ id: user.id, username: user.username }),
				session: Option.some({ id: session.id, expiresAt: session.expiresAt })
			})
		: Viewer.anonymous;

/** Validates a bearer token. Lookups that fail are treated as anonymous and logged. */
const validateBearer = (token: string | null) =>
	Effect.gen(function* () {
		if (!token) return Viewer.anonymous;
		const sessions = yield* Sessions;
		const { user, session } = yield* sessions.validate(token);
		return viewerFromValidation(user, session);
	});

export const OptionalAuthenticationLive = Layer.effect(
	OptionalAuthentication,
	Effect.gen(function* () {
		const sessions = yield* Sessions;
		return (httpEffect) =>
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const viewer = yield* validateBearer(readBearerToken(request.headers.authorization)).pipe(
					Effect.provideService(Sessions, sessions)
				);
				return yield* Effect.provideService(httpEffect, Viewer, viewer);
			}).pipe(Effect.catchTag('MongoError', (error) => Effect.succeed(problemFromError(error))));
	})
);

export const AuthenticationLive = Layer.effect(
	Authentication,
	Effect.gen(function* () {
		const sessions = yield* Sessions;
		const auditLog = yield* AuditLog;
		return {
			bearerAuth: (httpEffect, { endpoint }) =>
				Effect.gen(function* () {
					const request = yield* HttpServerRequest.HttpServerRequest;
					const viewer = yield* validateBearer(
						readBearerToken(request.headers.authorization)
					).pipe(Effect.provideService(Sessions, sessions));
					if (Option.isNone(viewer.user) || Option.isNone(viewer.session)) {
						const denied = Context.getOption(endpoint.annotations, DeniedAudit);
						if (Option.isSome(denied)) {
							const { params } = yield* HttpRouter.RouteContext;
							// Read optionally: the middleware type cannot require per-request services.
							const context = yield* Effect.serviceOption(RequestContext);
							const ip = Option.match(context, { onNone: () => undefined, onSome: (c) => c.ip });
							const slug = params.slug ? parseRouteSlug(params.slug) : null;
							yield* auditLog.log({
								eventType: denied.value.eventType,
								outcome: 'denied',
								ip,
								targetSlug: slug ?? undefined,
								reason: denied.value.reason
							});
						}
						return unauthorizedProblem();
					}
					const currentUser = CurrentUser.of({
						...viewer.user.value,
						session: viewer.session.value
					});
					return yield* httpEffect.pipe(
						Effect.provideService(CurrentUser, currentUser),
						Effect.provideService(Viewer, viewer)
					);
				}).pipe(Effect.catchTag('MongoError', (error) => Effect.succeed(problemFromError(error))))
		};
	})
);

const notFound = () => ReviewNotFound.default();

/** The stored review after a write, read back for the response body and its ETag. */
const reviewResponse = (slug: string, init: { status?: number; location?: boolean } = {}) =>
	Effect.gen(function* () {
		const review = yield* ReviewStore.use((store) => store.findActiveBySlug(slug));
		if (!review) return yield* new StorageFailed({ message: 'Recensionen kunde inte läsas.' });
		return jsonResponse(toApiReview(review), {
			status: init.status,
			headers: {
				etag: reviewETag(review),
				...(init.location ? { location: reviewPath(review.slug) } : {})
			}
		});
	});

const SessionsLive = HttpApiBuilder.group(EnStorStarkApi, 'sessions', (handlers) =>
	handlers
		.handleRaw('createSession', ({ request }) =>
			respond(
				Effect.gen(function* () {
					// The IP quota is charged before the body is read, even for malformed requests.
					const admission = yield* admitLoginIp('api');
					const body = yield* readJsonBody(webRequest(request), 'SessionCreateRequest').pipe(
						Effect.tapError(() =>
							Effect.gen(function* () {
								const { ip } = yield* RequestContext;
								yield* audit({
									eventType: 'login_attempt',
									outcome: 'failure',
									ip,
									reason: 'invalid_api_body',
									details: { channel: 'api' }
								});
							})
						)
					);
					const { user, session } = yield* loginWithPassword(
						{ username: body.username, password: body.password, channel: 'api' },
						{ ipAdmission: admission }
					);
					return jsonResponse(
						{
							token: session.id,
							expiresAt: session.expiresAt.toISOString(),
							user: { username: user.username }
						},
						{ status: 201 }
					);
				})
			)
		)
		.handleRaw('getCurrentSession', () =>
			Effect.gen(function* () {
				const user = yield* CurrentUser;
				return jsonResponse({
					user: { username: user.username },
					expiresAt: user.session.expiresAt.toISOString()
				});
			})
		)
		.handleRaw('deleteCurrentSession', () =>
			respond(
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const { ip } = yield* RequestContext;
					yield* Sessions.use((sessions) => sessions.invalidate(user.session.id));
					yield* audit({
						eventType: 'logout',
						outcome: 'success',
						username: user.username,
						ip,
						details: { channel: 'api' }
					});
					return HttpServerResponse.empty({ status: 204 });
				})
			)
		)
);

const MetadataLive = HttpApiBuilder.group(EnStorStarkApi, 'metadata', (handlers) =>
	handlers
		.handleRaw('getReviewMetadata', ({ request }) =>
			Effect.gen(function* () {
				const viewer = yield* Viewer;
				return cachedJsonResponse(
					webRequest(request),
					Option.isSome(viewer.user),
					buildReviewMetadata()
				);
			})
		)
		.handleRaw('listUsers', () =>
			respond(
				UserStore.use((users) => users.listUsernames()).pipe(
					Effect.map((usernames) =>
						jsonResponse({ users: usernames.map((username) => ({ username })) })
					)
				)
			)
		)
);

const ReviewsLive = HttpApiBuilder.group(EnStorStarkApi, 'reviews', (handlers) =>
	handlers
		.handleRaw('listReviews', ({ request }) =>
			respond(
				Effect.gen(function* () {
					const params = searchParams(request);
					const authenticated = yield* Viewer.isAuthenticated;
					const reviews = yield* ReviewStore.use((store) =>
						store.findVisible(
							buildReviewSearchFilter(sanitizeReviewSearch(params.get('search'))),
							authenticated
						)
					);
					const sorted = sortReviews(reviews, normalizeReviewSort(params.get('sort')), (review) => ({
						id: review._id.toString(),
						createdAt: review.createdAt,
						rating: review.rating
					}));
					return cachedJsonResponse(webRequest(request), authenticated, {
						reviews: sorted.map(toApiReview)
					});
				})
			)
		)
		.handleRaw('createReview', ({ request }) =>
			respond(
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const { ip } = yield* RequestContext;
					yield* audit({
						eventType: 'review_create',
						outcome: 'attempt',
						username: user.username,
						ip
					});
					const body = yield* readJsonBody(webRequest(request), 'ReviewCreateRequest');
					const form = yield* toReviewFormData(body);
					const { slug } = yield* createDraftReview(form).pipe(
						Effect.mapError(toApiReviewError)
					);
					return yield* reviewResponse(slug, { status: 201, location: true });
				})
			)
		)
		.handleRaw('getReview', ({ params, request }) =>
			respond(
				Effect.gen(function* () {
					const slug = parseRouteSlug(params.slug);
					if (!slug) return yield* notFound();
					const authenticated = yield* Viewer.isAuthenticated;
					const review = yield* ReviewStore.use((store) =>
						store.findVisibleBySlug(slug, authenticated)
					);
					if (!review) return yield* notFound();
					return cachedJsonResponse(webRequest(request), authenticated, toApiReview(review), {
						etag: reviewETag(review)
					});
				})
			)
		)
		.handleRaw('updateReview', ({ params, request }) =>
			respond(
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					const { ip } = yield* RequestContext;
					yield* audit({ eventType: 'review_edit', outcome: 'attempt', username: user.username, ip });

					const slug = parseRouteSlug(params.slug);
					if (!slug) return yield* notFound();
					const ifMatch = request.headers['if-match'];
					if (!ifMatch) {
						return yield* new PreconditionRequired({
							message: 'Ange versionen av recensionen (If-Match) för att ändra den.'
						});
					}
					const body = yield* readJsonBody(webRequest(request), 'ReviewUpdateRequest');

					const existing = yield* ReviewStore.use((store) => store.findActiveBySlug(slug));
					if (!existing) return yield* notFound();
					yield* checkIfMatch(ifMatch, reviewETag(existing));

					// `existing` matches If-Match and the edit writes only that version, so the kept
					// attributes cannot overwrite a parallel change.
					const form = yield* toReviewFormData(body, {
						id: existing._id.toHexString(),
						currentAttributes: normalizeBarAttributes(existing.attributes),
						currentBeerVolumeCl: existing.beerVolumeCl
					});
					const result = yield* editReview(form, slug, {
						expectedUpdatedAt: new Date(existing.updatedAt)
					}).pipe(Effect.mapError(toApiReviewError));
					return yield* reviewResponse(result.slug);
				})
			)
		)
		.handleRaw('deleteReview', ({ params, request }) =>
			respond(
				Effect.gen(function* () {
					const ifMatch = request.headers['if-match'];
					if (!ifMatch) {
						return yield* new PreconditionRequired({
							message: 'Ange versionen av recensionen (If-Match) för att ta bort den.'
						});
					}
					const slug = parseRouteSlug(params.slug);
					if (!slug) return yield* notFound();

					const existing = yield* ReviewStore.use((store) => store.findActiveBySlug(slug));
					if (!existing) return yield* notFound();
					yield* checkIfMatch(ifMatch, reviewETag(existing));

					yield* deleteReview(slug, { expectedUpdatedAt: new Date(existing.updatedAt) });
					return HttpServerResponse.empty({ status: 204, headers: { 'cache-control': 'no-store' } });
				})
			)
		)
		.handleRaw('publishReview', ({ params }) =>
			respond(
				publishReview(parseRouteSlug(params.slug)).pipe(
					Effect.flatMap(({ slug }) => reviewResponse(slug))
				)
			)
		)
		.handleRaw('getReviewHistory', ({ params, request }) =>
			respond(
				Effect.gen(function* () {
					const slug = parseRouteSlug(params.slug);
					if (!slug) return yield* notFound();
					const authenticated = yield* Viewer.isAuthenticated;
					const review = yield* ReviewStore.use((store) =>
						store.findVisibleBySlug(slug, authenticated)
					);
					if (!review) return yield* notFound();
					return cachedJsonResponse(webRequest(request), authenticated, toApiReviewHistory(review));
				})
			)
		)
		.handleRaw('getNearbyReviews', ({ request }) =>
			respond(
				Effect.gen(function* () {
					// Counts include drafts; the Authentication middleware ran before this handler.
					const params = searchParams(request);
					const addresses = params.getAll('address');
					const excludes = params.getAll('exclude');
					if (
						addresses.length !== 1 ||
						!addresses[0].trim() ||
						addresses[0].length > MAX_SHORT_TEXT
					) {
						return yield* new BadRequest({ message: 'Ange en adress på högst 300 tecken.' });
					}
					if (excludes.length > 1) {
						return yield* new BadRequest({ message: 'Ange högst en recension att utesluta.' });
					}

					let excludeId;
					if (excludes.length === 1) {
						const slug = parseRouteSlug(excludes[0]);
						if (!slug) return yield* new BadRequest({ message: 'Ogiltig recension att utesluta.' });
						const review = yield* ReviewStore.use((store) => store.findActiveBySlug(slug));
						if (!review) return yield* notFound();
						excludeId = review._id;
					}

					const comparison = yield* loadNearbyReviewComparison(excludeId);
					if (!comparison.available) {
						return yield* new ServiceUnavailable({
							message: 'Jämförelsen kunde inte laddas just nu.'
						});
					}
					return jsonResponse(toApiNearbyReviews(addresses[0], comparison));
				})
			)
		)
);

const ImagesLive = HttpApiBuilder.group(EnStorStarkApi, 'images', (handlers) =>
	handlers.handleRaw('getImage', ({ params, request }) =>
		respond(
			readReviewImage(params.filename, searchParams(request).getAll('preview')).pipe(
				Effect.map((image) =>
					HttpServerResponse.uint8Array(new Uint8Array(image.body), {
						contentType: image.contentType,
						headers: { 'cache-control': image.cacheControl, vary: 'Authorization' }
					})
				)
			)
		)
	)
);

const MapLive = HttpApiBuilder.group(EnStorStarkApi, 'map', (handlers) =>
	handlers
		.handleRaw('getMap', ({ request }) =>
			respond(
				Effect.gen(function* () {
					const data = yield* ReviewMap.use((map) => map.get);
					return cachedJsonResponse(
						webRequest(request),
						yield* Viewer.isAuthenticated,
						toApiReviewMap(data)
					);
				})
			)
		)
		// Only reviewers may trigger geocoding; anonymous readers only see cached markers.
		.handleRaw('resolveNextMapMarker', () =>
			respond(
				Effect.gen(function* () {
					const map = yield* ReviewMap;
					const marker = yield* map.resolveOne;
					if (!marker) return HttpServerResponse.empty({ status: 204 });
					return jsonResponse(toApiReviewMap(yield* map.get));
				})
			)
		)
);

const StatisticsLive = HttpApiBuilder.group(EnStorStarkApi, 'statistics', (handlers) =>
	handlers.handleRaw('getStatistics', ({ request }) =>
		respond(
			Effect.gen(function* () {
				// The price chart points are web-only and not part of the API contract.
				const { priceComparison: _priceComparison, ...statistics } =
					yield* ReviewStatistics.use((service) => service.get);
				return cachedJsonResponse(
					webRequest(request),
					yield* Viewer.isAuthenticated,
					statistics
				);
			})
		)
	)
);

const ReviewRequestsLive = HttpApiBuilder.group(EnStorStarkApi, 'reviewRequests', (handlers) =>
	handlers.handleRaw('createReviewRequest', ({ request }) =>
		respond(
			Effect.gen(function* () {
				// The IP quota is charged before the body is read, even for malformed requests.
				const admission = yield* admitReviewRequestIp;
				const body = yield* readJsonBody(webRequest(request), 'ReviewRequestCreateRequest').pipe(
					Effect.tapError(() =>
						Effect.gen(function* () {
							const { ip } = yield* RequestContext;
							yield* audit({
								eventType: 'review_request',
								outcome: 'failure',
								ip,
								reason: 'invalid_api_body'
							});
						})
					)
				);
				// The web form's honeypot does not apply to native clients; the rate limits still do.
				const data = new FormData();
				data.set('barName', body.barName);
				data.set('location', body.location);
				data.set('motivation', body.motivation ?? '');
				const accepted = yield* submitReviewRequest(data, { ipAdmission: admission });
				return jsonResponse(accepted, { status: 202 });
			})
		)
	)
);

/** Every `/api/v1` handler, with the authentication middlewares. */
export const ApiHandlersLive = Layer.mergeAll(
	SessionsLive,
	MetadataLive,
	ReviewsLive,
	ImagesLive,
	MapLive,
	StatisticsLive,
	ReviewRequestsLive
).pipe(Layer.provide([AuthenticationLive, OptionalAuthenticationLive]));

