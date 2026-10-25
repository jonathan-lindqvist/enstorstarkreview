import { vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { Session } from 'lucia';
import { ObjectId } from 'mongodb';
import { createReviewRatingValues } from '$lib/review-metadata';
import type { BarReview } from '$lib/types/bar-review';
import type { RpcContext, RpcDependencies } from './context';

/**
 * Test doubles for procedure tests. Procedures get everything through their context, so a test
 * builds a context with fakes instead of mocking modules, then calls the procedure with oRPC's
 * `call()` or sends a request through the API door.
 */

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : DeepPartial<T[K]>;
};

const allowed = { allowed: true, retryAfterSeconds: 0, remainingAttempts: 4 };

export const testReview = (overrides: Partial<BarReview> = {}): BarReview => ({
	_id: new ObjectId('6a1e9d487d43112acf4a0c36'),
	title: 'Baren',
	description: 'Beskrivning',
	location: 'Gatan 1',
	slug: 'baren',
	...createReviewRatingValues(3),
	rating: 2,
	image: '6a1e9d487d43112acf4a0c36.jpg',
	author: 'editor',
	coAuthors: [],
	publicationStatus: 'draft',
	createdAt: new Date(0),
	updatedAt: new Date(1000),
	...overrides
});

const writeDependencies = () => ({
	loadValidUsernames: vi.fn(async (authors: string[]) => authors),
	findSlugConflict: vi.fn().mockResolvedValue(null),
	uploadImage: vi.fn().mockResolvedValue({ ok: true, upload: null }),
	cleanupImage: vi.fn().mockResolvedValue(undefined),
	audit: vi.fn().mockResolvedValue(undefined),
	now: () => new Date(2000)
});

/** Fakes for every dependency; pass overrides for the ones a test cares about. */
export const testDependencies = (overrides: DeepPartial<RpcDependencies> = {}): RpcDependencies => {
	const audit = overrides.audit ?? vi.fn().mockResolvedValue(undefined);
	const merge = <T extends object>(defaults: T, override: object | undefined): T => {
		const defined = Object.entries(override ?? {}).filter(([, value]) => value !== undefined);
		return { ...defaults, ...Object.fromEntries(defined) } as T;
	};
	return {
		audit,
		reviews: merge(
			{
				find: vi.fn().mockResolvedValue([]),
				findOne: vi.fn().mockResolvedValue(null),
				create: merge(
					{ ...writeDependencies(), audit, insertReview: vi.fn() },
					overrides.reviews?.create
				),
				edit: merge(
					{
						...writeDependencies(),
						audit,
						findReview: vi.fn().mockResolvedValue(null),
						updateReview: vi.fn().mockResolvedValue({ matchedCount: 1 }),
						invalidatePublicViews: vi.fn()
					},
					overrides.reviews?.edit
				),
				publish: merge(
					{
						publishDraft: vi.fn(async () => ({ outcome: 'published', review: testReview() })),
						invalidatePublicViews: vi.fn(),
						audit,
						now: () => new Date(2000)
					},
					overrides.reviews?.publish
				),
				delete: merge(
					{
						softDelete: vi.fn(async () => ({ outcome: 'deleted', review: testReview() })),
						invalidatePublicViews: vi.fn(),
						audit,
						now: () => new Date(2000)
					},
					overrides.reviews?.delete
				),
				loadNearbyComparison: vi.fn()
			},
			{
				...overrides.reviews,
				create: undefined,
				edit: undefined,
				publish: undefined,
				delete: undefined
			}
		),
		images: merge(
			{
				findReview: vi.fn().mockResolvedValue(null),
				readImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
				readPreview: vi.fn().mockResolvedValue(new Uint8Array([4, 5]))
			},
			overrides.images
		),
		login: merge(
			{
				consumeRateLimit: vi.fn().mockResolvedValue(allowed),
				clearRateLimit: vi.fn().mockResolvedValue(undefined),
				verifyCredentials: vi.fn().mockResolvedValue({
					ok: true,
					user: { _id: 'user-id', username: 'test' }
				}),
				createSession: vi.fn().mockResolvedValue({
					id: 'secret-token',
					expiresAt: new Date('2030-01-01T00:00:00Z')
				}),
				audit
			},
			overrides.login
		),
		sessions: merge({ invalidate: vi.fn().mockResolvedValue(undefined) }, overrides.sessions),
		users: merge({ listUsernames: vi.fn().mockResolvedValue(['editor']) }, overrides.users),
		map: merge(
			{
				getData: vi.fn().mockResolvedValue({ markers: [], totalReviews: 0 }),
				resolveOneMarker: vi.fn().mockResolvedValue(null)
			},
			overrides.map
		),
		statistics: merge({ get: vi.fn() }, overrides.statistics),
		reviewRequests: merge(
			{
				consumeRateLimit: vi.fn().mockResolvedValue(allowed),
				deliver: vi.fn().mockResolvedValue('discord'),
				audit,
				now: () => new Date('2026-10-07T00:00:00Z')
			},
			overrides.reviewRequests
		)
	} as RpcDependencies;
};

export const testUser = (username = 'editor'): App.AuthUser => ({ id: `${username}-id`, username });

export const testSession = (): Session =>
	({
		id: 'session-id',
		userId: 'editor-id',
		expiresAt: new Date('2030-01-01T00:00:00Z'),
		fresh: false
	}) as Session;

/** A procedure context; `user: null` for an anonymous caller. */
export const testContext = (
	overrides: Partial<RpcContext> & { username?: string | null } = {}
): RpcContext => {
	const { username = 'editor', ...rest } = overrides;
	return {
		user: username ? testUser(username) : null,
		session: username ? testSession() : null,
		ip: '203.0.113.10',
		channel: 'api',
		deps: testDependencies(),
		...rest
	};
};

/** A SvelteKit request event as the API door or a page action receives it. */
export const testEvent = (
	url: string,
	init: RequestInit & { username?: string | null; deps?: RpcDependencies } = {}
) => {
	const { username = null, deps = testDependencies(), ...requestInit } = init;
	return {
		request: new Request(new URL(url, 'http://localhost'), requestInit),
		url: new URL(url, 'http://localhost'),
		params: {},
		locals: {
			user: username ? testUser(username) : null,
			session: username ? testSession() : null,
			deps
		},
		getClientAddress: () => '203.0.113.10',
		setHeaders: vi.fn()
	} as unknown as RequestEvent;
};
