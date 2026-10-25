import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeApiHandler } from '$lib/server/api/server';
import { reviewETag } from '$lib/server/api/reviews';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { makeTestAppLayer, makeTestWorld } from '$lib/server/testing';

// The whole API door (HttpApi routing, bearer middleware, If-Match, problem responses) over
// in-memory review services. No vi.mock: the test swaps layers.
const setup = () => {
	const review = createExistingReview({ slug: 'baren', publicationStatus: 'draft' });
	const world = makeTestWorld({ reviews: [review] });
	const api = makeApiHandler(
		makeTestAppLayer(world, { tokens: { 'bob-token': { id: 'bob-id', username: 'bob' } } })
	);
	const del = (options: { token?: string | null; ifMatch?: string | null; slug?: string } = {}) => {
		const headers: Record<string, string> = {};
		const token = options.token === undefined ? 'bob-token' : options.token;
		const ifMatch = options.ifMatch === undefined ? reviewETag(review) : options.ifMatch;
		if (token) headers.authorization = `Bearer ${token}`;
		if (ifMatch) headers['if-match'] = ifMatch;
		return api.handle(
			new Request(`http://localhost/api/v1/reviews/${options.slug ?? 'baren'}`, {
				method: 'DELETE',
				headers
			}),
			'test-ip'
		);
	};
	return { review, world, del, api };
};

const problemCode = async (response: Response) => (await response.json()).code;

afterEach(() => vi.restoreAllMocks());

describe('API review deletion', () => {
	it('denies and audits anonymous and invalid tokens without reading the review', async () => {
		const { world, del } = setup();
		for (const token of [null, 'forged']) {
			const response = await del({ token });
			expect(response.status).toBe(401);
			expect(response.headers.get('www-authenticate')).toBe('Bearer');
			expect(response.headers.get('content-type')).toBe('application/problem+json');
			expect(await problemCode(response)).toBe('unauthorized');
		}
		expect(world.reviews[0].deletedAt).toBeUndefined();
		expect(world.audits.map((event) => [event.outcome, event.reason, event.targetSlug])).toEqual([
			['denied', 'unauthenticated_api_delete', 'baren'],
			['denied', 'unauthenticated_api_delete', 'baren']
		]);
	});

	it('ignores the web session cookie', async () => {
		const { del, api } = setup();
		const response = await api.handle(
			new Request('http://localhost/api/v1/reviews/baren', {
				method: 'DELETE',
				headers: { cookie: 'auth_session=bob-token' }
			}),
			'test-ip'
		);
		expect(response.status).toBe(401);
		expect((await del()).status).toBe(204);
	});

	it('requires a current strong version before writing', async () => {
		const { world, review, del } = setup();
		const missing = await del({ ifMatch: null });
		expect(missing.status).toBe(428);
		expect(await problemCode(missing)).toBe('precondition_required');

		for (const header of ['*', `W/${reviewETag(review)}`, '"stale"', `*, ${reviewETag(review)}`]) {
			const response = await del({ ifMatch: header });
			expect(response.status).toBe(412);
			expect(await problemCode(response)).toBe('precondition_failed');
		}
		expect(world.reviews[0].deletedAt).toBeUndefined();
		expect(world.invalidations).toBe(0);
	});

	it('soft-deletes the matching version, refreshes public caches and returns no content', async () => {
		const { world, del } = setup();
		const response = await del();

		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('');
		expect(world.reviews[0]).toMatchObject({ deletedBy: 'bob' });
		expect(world.invalidations).toBe(1);
		expect(world.audits.at(-1)).toMatchObject({
			outcome: 'success',
			username: 'bob',
			ip: 'test-ip'
		});
	});

	it('does not delete a review that was edited after the version check', async () => {
		const { world, review, del } = setup();
		// The version check passes; a parallel edit lands before the conditional delete.
		world.beforeUpdate = () => {
			review.updatedAt = new Date('2026-02-01T00:00:00Z');
		};

		const response = await del();
		expect(response.status).toBe(409);
		expect(await problemCode(response)).toBe('concurrent_update');
		expect(review.deletedAt).toBeUndefined();
		expect(world.invalidations).toBe(0);
	});

	it('returns not found for invalid slugs and missing or deleted reviews', async () => {
		const { del } = setup();
		expect((await del({ slug: '%25' })).status).toBe(404);
		expect((await del({ slug: 'missing' })).status).toBe(404);
		expect((await del()).status).toBe(204);
		const second = await del();
		expect(second.status).toBe(404);
		expect(await problemCode(second)).toBe('not_found');
	});

	it('fails closed without details when storage fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { world, del } = setup();
		world.failing.add('softDelete');

		const response = await del();
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ code: 'internal_error' });
		expect(world.invalidations).toBe(0);
	});
});
