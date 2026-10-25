import { ObjectId } from 'mongodb';
import { Effect, Exit, Layer, Option, Scope } from 'effect';
import type { BarReview } from '$lib/types/bar-review';
import { AuditLog, type AuditEventInput } from '$lib/server/audit';
import { Sessions } from '$lib/server/auth';
import { PasswordHasher } from '$lib/server/login/credentials';
import { Geocoder } from '$lib/server/map/nominatim';
import { ReviewMap } from '$lib/server/map/service';
import { AppConfig } from '$lib/server/platform/config';
import { Mongo, MongoError } from '$lib/server/platform/mongo';
import { useTestRuntime } from '$lib/server/platform/runtime';
import { LoginRateLimiter } from '$lib/server/rate-limit';
import { ReviewRequestRateLimiter } from '$lib/server/review-request-rate-limit';
import { ReviewRequestDelivery } from '$lib/server/review-requests/delivery';
import { ReviewStatistics } from '$lib/server/review-statistics';
import type { ReviewRequestSubmission } from '$lib/types/review-request';
import { buildPublishReviewUpdate, isDraftReview } from '$lib/server/review-publication';
import { ReviewImages } from '$lib/server/review-images';
import { CurrentUser, RequestContext, Viewer } from '$lib/server/request';
import { PublicReviewViews } from '$lib/server/reviews/public-cache';
import { ReviewStore } from '$lib/server/reviews/store';
import { UserStore } from '$lib/server/users';
import { ReviewInvalid } from '$lib/server/errors';

/**
 * In-memory test doubles for the review services. Tests build a `TestWorld`, run a workflow
 * with `runWorkflow`, and assert on the world afterwards: stored reviews, audit events, image
 * files written and removed, and cache invalidations. No MongoDB, no file system.
 */
export interface TestWorld {
	reviews: BarReview[];
	usernames: string[];
	/** Plain-text passwords by username, checked by the test password hasher. */
	passwords: Record<string, string>;
	audits: AuditEventInput[];
	/** Image files the workflow wrote, and the ones it removed again on failure. */
	images: { written: string[]; removed: string[] };
	invalidations: number;
	/** Store operations that fail with a `MongoError`, to test outage paths. */
	failing: Set<keyof ReviewStore['Service'] | 'existingUsernames'>;
	/** The next upload fails validation with this message. */
	rejectImage?: string;
	/** Runs just before a conditional write (update, publish, delete), to simulate a parallel writer. */
	beforeUpdate?: () => void;
}

export const makeTestWorld = (overrides: Partial<TestWorld> = {}): TestWorld => ({
	reviews: [],
	usernames: ['current'],
	passwords: {},
	audits: [],
	images: { written: [], removed: [] },
	invalidations: 0,
	failing: new Set(),
	...overrides
});

const isActive = (review: BarReview) => review.deletedAt === undefined;
const sameTime = (a: Date | string, b: Date | string) =>
	new Date(a).getTime() === new Date(b).getTime();

const storeLayer = (world: TestWorld) =>
	Layer.succeed(
		ReviewStore,
		ReviewStore.of(
			Object.fromEntries(
				Object.entries({
					findVisibleBySlug: (slug: string, authenticated: boolean) =>
						world.reviews.find(
							(review) =>
								review.slug === slug &&
								isActive(review) &&
								(authenticated || !isDraftReview(review))
						) ?? null,
					findActiveBySlug: (slug: string) =>
						world.reviews.find((review) => review.slug === slug && isActive(review)) ?? null,
					findActiveById: (id: ObjectId) =>
						world.reviews.find((review) => review._id.equals(id) && isActive(review)) ?? null,
					findSlugConflict: (slug: string, excludeId?: ObjectId) =>
						world.reviews.find(
							(review) => review.slug === slug && !excludeId?.equals(review._id)
						) ?? null,
					findVisible: (_filter: unknown, authenticated: boolean) =>
						world.reviews.filter(
							(review) => isActive(review) && (authenticated || !isDraftReview(review))
						),
					findActive: () => world.reviews.filter(isActive),
					insert: (review: BarReview) => {
						world.reviews.push(review);
					},
					updateIfUnchanged: (
						id: ObjectId,
						update: Partial<BarReview>,
						expectedUpdatedAt: Date
					) => {
						world.beforeUpdate?.();
						const index = world.reviews.findIndex(
							(review) =>
								review._id.equals(id) &&
								isActive(review) &&
								sameTime(review.updatedAt, expectedUpdatedAt)
						);
						if (index === -1) return { matchedCount: 0 };
						world.reviews[index] = { ...world.reviews[index], ...update };
						return { matchedCount: 1 };
					},
					publishDraft: (slug: string, publisher: string, now: Date) => {
						world.beforeUpdate?.();
						const review = world.reviews.find((r) => r.slug === slug && isActive(r));
						if (!review) return { outcome: 'not_found' };
						if (!isDraftReview(review)) return { outcome: 'already_published', review };
						Object.assign(review, buildPublishReviewUpdate(review, publisher, now));
						return { outcome: 'published', review };
					},
					softDelete: (slug: string, deletedBy: string, now: Date, expectedUpdatedAt?: Date) => {
						world.beforeUpdate?.();
						const review = world.reviews.find((r) => r.slug === slug && isActive(r));
						if (!review) return { outcome: 'not_found' };
						if (expectedUpdatedAt && !sameTime(review.updatedAt, expectedUpdatedAt)) {
							return { outcome: 'conflict', review };
						}
						Object.assign(review, { deletedAt: now, deletedBy, updatedAt: now });
						return { outcome: 'deleted', review };
					}
				}).map(([name, operation]) => [
					name,
					(...args: never[]) =>
						world.failing.has(name as keyof ReviewStore['Service'])
							? Effect.fail(new MongoError({ cause: new Error(`${name} unavailable`) }))
							: Effect.sync(() => (operation as (...a: never[]) => unknown)(...args))
				])
			) as unknown as ReviewStore['Service']
		)
	);

const userLayer = (world: TestWorld) =>
	Layer.succeed(
		UserStore,
		UserStore.of({
			findByUsername: (username) =>
				Effect.succeed(
					world.usernames.includes(username)
						? { _id: `id-${username}`, username, password: `plain:${world.passwords[username]}` }
						: null
				),
			existingUsernames: (usernames) =>
				world.failing.has('existingUsernames')
					? Effect.fail(new MongoError({ cause: new Error('users unavailable') }))
					: Effect.succeed(usernames.filter((name) => world.usernames.includes(name))),
			listUsernames: () => Effect.succeed([...world.usernames].sort()),
			listAuthorOptions: () =>
				Effect.succeed(world.usernames.map((username) => ({ _id: username, username })))
		})
	);

const imagesLayer = (world: TestWorld) =>
	Layer.succeed(
		ReviewImages,
		ReviewImages.of({
			directory: '/test-images',
			upload: (image, options) =>
				Effect.gen(function* () {
					if (!(image instanceof File) || image.size === 0) {
						if (options.required)
							return yield* new ReviewInvalid({ message: 'Ogiltig fil', pointer: '/image' });
						return null;
					}
					if (world.rejectImage) {
						return yield* new ReviewInvalid({ message: world.rejectImage, pointer: '/image' });
					}
					const filename = `${new ObjectId().toHexString()}.jpg`;
					return yield* Effect.acquireRelease(
						Effect.sync(() => {
							world.images.written.push(filename);
							return { filename, path: `/test-images/${filename}` };
						}),
						(upload, exit) =>
							Exit.isSuccess(exit)
								? Effect.void
								: Effect.sync(() => world.images.removed.push(upload.filename))
					);
				}),
			read: () => Effect.fail(new Error('no image')),
			readPreview: () => Effect.fail(new Error('no image'))
		})
	);

const auditLayer = (world: TestWorld) =>
	Layer.succeed(
		AuditLog,
		AuditLog.of({ log: (event) => Effect.sync(() => world.audits.push(event)) })
	);

const publicViewsLayer = (world: TestWorld) =>
	Layer.succeed(
		PublicReviewViews,
		PublicReviewViews.of({ invalidate: Effect.sync(() => void world.invalidations++) })
	);

/** The review services backed by the given world. */
export const reviewTestLayer = (world: TestWorld) =>
	Layer.mergeAll(
		storeLayer(world),
		userLayer(world),
		imagesLayer(world),
		auditLayer(world),
		publicViewsLayer(world)
	);

/** Sessions keyed by bearer token or cookie value, without Lucia or MongoDB. */
export const sessionsTestLayer = (tokens: Record<string, { id: string; username: string }>) =>
	Layer.succeed(
		Sessions,
		Sessions.of({
			sessionCookieName: 'auth_session',
			validate: (sessionId) =>
				Effect.succeed(
					tokens[sessionId]
						? {
								user: { ...tokens[sessionId] } as never,
								session: {
									id: sessionId,
									userId: tokens[sessionId].id,
									expiresAt: new Date('2030-01-01T00:00:00Z'),
									fresh: false
								}
							}
						: { user: null, session: null }
				),
			create: (userId) =>
				Effect.succeed({
					id: `session-${userId}`,
					userId,
					expiresAt: new Date('2030-01-01T00:00:00Z'),
					fresh: true
				}),
			invalidate: () => Effect.void,
			sessionCookie: (sessionId) =>
				({ name: 'auth_session', value: sessionId, attributes: {} }) as never,
			blankSessionCookie: () => ({ name: 'auth_session', value: '', attributes: {} }) as never
		})
	);

/** Request context for a workflow run: an IP and, unless `null`, a signed-in user. */
export const provideRequest =
	(options: { username?: string | null; ip?: string } = {}) =>
	<A, E, R>(effect: Effect.Effect<A, E, R>) => {
		const username = options.username === undefined ? 'current' : options.username;
		const user = username ? { id: `id-${username}`, username } : null;
		const session = { id: 'session', expiresAt: new Date('2030-01-01T00:00:00Z') };
		const withContext = effect.pipe(
			Effect.provideService(RequestContext, RequestContext.of({ ip: options.ip ?? 'test-ip' })),
			Effect.provideService(
				Viewer,
				user
					? Viewer.of({ user: Option.some(user), session: Option.some(session) })
					: Viewer.anonymous
			)
		);
		return user
			? withContext.pipe(Effect.provideService(CurrentUser, CurrentUser.of({ ...user, session })))
			: withContext;
	};

/** Runs a signed-in workflow against a world and returns its exit. */
export const runWorkflow = <A, E>(
	world: TestWorld,
	effect: Effect.Effect<
		A,
		E,
		| ReviewStore
		| UserStore
		| ReviewImages
		| AuditLog
		| PublicReviewViews
		| CurrentUser
		| RequestContext
		| Viewer
		| Scope.Scope
	>,
	options: { username?: string; ip?: string } = {}
) =>
	Effect.runPromiseExit(
		effect.pipe(
			provideRequest(options),
			Effect.scoped,
			Effect.provide(reviewTestLayer(world))
		) as Effect.Effect<A, E>
	);

/** The typed failure of an exit, or undefined for success and defects. */
export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E | undefined =>
	Exit.isFailure(exit) ? Option.getOrUndefined(Exit.findErrorOption(exit)) : undefined;

/**
 * The whole application graph for route and API tests: in-memory review services from the
 * world, test sessions, a recording Discord sink, and the real remaining services over the
 * given stub collections. Collections a test does not stub throw when used.
 */
export const makeTestAppLayer = (
	world: TestWorld,
	options: {
		tokens?: Record<string, { id: string; username: string }>;
		collections?: Parameters<typeof Mongo.layerTest>[0];
		delivered?: ReviewRequestSubmission[];
		config?: Parameters<typeof AppConfig.layerTest>[0];
		/** Replacement services, for example a scripted rate limiter or delivery outcome. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		overrides?: Layer.Layer<any, never, Geocoder | Mongo | AppConfig>;
	} = {}
) =>
	Layer.mergeAll(
		reviewTestLayer(world),
		sessionsTestLayer(options.tokens ?? {}),
		ReviewRequestDelivery.layerTest(options.delivered ?? []),
		Layer.succeed(
			PasswordHasher,
			PasswordHasher.of({
				hash: () => Effect.void,
				verify: (stored, password) => Effect.succeed(stored === `plain:${password}`)
			})
		),
		LoginRateLimiter.layer,
		ReviewRequestRateLimiter.layer,
		ReviewStatistics.layer,
		ReviewMap.layer,
		options.overrides ?? Layer.empty
	).pipe(
		Layer.provideMerge(Geocoder.layer),
		Layer.provideMerge(Mongo.layerTest(options.collections ?? {})),
		Layer.provideMerge(AppConfig.layerTest(options.config))
	);

/**
 * Runs SvelteKit loads, actions and endpoints on a test application layer for one test.
 * Call in `beforeEach` and pass the result to `afterEach`.
 */
export const useTestApp = (
	world: TestWorld,
	options: Parameters<typeof makeTestAppLayer>[1] = {}
) => useTestRuntime(makeTestAppLayer(world, options));

/** A SvelteKit request event with only what `runWeb` and the routes read. */
export const webEvent = <Event>(options: {
	url: string;
	method?: string;
	body?: BodyInit;
	headers?: Record<string, string>;
	user?: { id?: string; username: string } | null;
	params?: Record<string, string>;
}): Event => {
	const url = new URL(options.url, 'http://localhost');
	const user = options.user
		? { id: options.user.id ?? `id-${options.user.username}`, username: options.user.username }
		: null;
	return {
		url,
		params: options.params ?? {},
		request: new Request(url, {
			method: options.method ?? 'GET',
			body: options.body,
			headers: options.headers
		}),
		locals: {
			user,
			session: user
				? {
						id: 'session',
						userId: user.id,
						expiresAt: new Date(Date.now() + 86_400_000),
						fresh: false
					}
				: null
		},
		getClientAddress: () => '198.51.100.7',
		setHeaders: () => undefined,
		cookies: {
			get: () => undefined,
			set: () => undefined,
			delete: () => undefined,
			serialize: () => ''
		}
	} as Event;
};
