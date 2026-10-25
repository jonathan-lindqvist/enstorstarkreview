import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { makeTestWorld, useTestApp, webEvent, type TestWorld } from '$lib/server/testing';
import { actions } from './[slug]/+page.server';

// The web door for the same `deleteReview` workflow the API's DELETE runs.
const review = createExistingReview({ slug: 'baren', publicationStatus: 'published' });

const deleteEvent = (
	username: string | null,
	options: { slug?: string; version?: string } = {}
) => {
	const body = new URLSearchParams(
		options.version === undefined ? {} : { version: options.version }
	);
	return webEvent<Parameters<typeof actions.delete>[0]>({
		url: `/${options.slug ?? 'baren'}?/delete`,
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body,
		user: username ? { username } : null,
		params: { slug: options.slug ?? 'baren' }
	});
};

const auditOutcomes = (world: TestWorld) =>
	world.audits.map((event) => [event.eventType, event.outcome, event.reason]);

let world: TestWorld;
let restore: () => Promise<void>;
beforeEach(() => {
	world = makeTestWorld({ reviews: [{ ...review }] });
	restore = useTestApp(world);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await restore();
});

describe('review page delete action', () => {
	it('denies and audits anonymous requests without reading or writing the review', async () => {
		const result = await actions.delete(deleteEvent(null));

		expect(result).toMatchObject({ status: 401, data: { message: 'Du är inte inloggad' } });
		expect(world.reviews[0].deletedAt).toBeUndefined();
		expect(auditOutcomes(world)).toEqual([['review_delete', 'denied', 'unauthenticated_delete']]);
	});

	it('soft-deletes for a signed-in user, refreshes public caches and redirects', async () => {
		await expect(actions.delete(deleteEvent('bob'))).rejects.toMatchObject({
			status: 303,
			location: '/admin/reviews?borttagen=1'
		});

		expect(world.reviews[0]).toMatchObject({ deletedBy: 'bob' });
		expect(world.invalidations).toBe(1);
		expect(auditOutcomes(world).at(-1)).toEqual(['review_delete', 'success', undefined]);
	});

	it('deletes the version the edit page showed', async () => {
		const version = String(review.updatedAt.getTime());
		await expect(actions.delete(deleteEvent('bob', { version }))).rejects.toMatchObject({
			status: 303
		});
		expect(world.reviews[0].deletedAt).toBeInstanceOf(Date);
	});

	it('returns not found for invalid slugs and reviews that are already deleted', async () => {
		await expect(actions.delete(deleteEvent('bob', { slug: '%' }))).resolves.toMatchObject({
			status: 404
		});
		world.reviews[0].deletedAt = new Date();
		await expect(actions.delete(deleteEvent('bob'))).resolves.toMatchObject({ status: 404 });
		expect(world.invalidations).toBe(0);
	});

	it('does not delete a review that changed after the edit page showed it', async () => {
		const stale = String(review.updatedAt.getTime() - 1);

		await expect(actions.delete(deleteEvent('bob', { version: stale }))).resolves.toMatchObject({
			status: 409,
			data: { message: 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.' }
		});
		expect(world.reviews[0].deletedAt).toBeUndefined();
		expect(world.invalidations).toBe(0);
	});

	it('rejects a malformed version before writing', async () => {
		for (const version of ['abc', '-1', '1.5']) {
			await expect(actions.delete(deleteEvent('bob', { version }))).resolves.toMatchObject({
				status: 400
			});
		}
		expect(world.reviews[0].deletedAt).toBeUndefined();
	});

	it('fails closed on a storage outage without invalidating caches', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		world.failing.add('softDelete');
		await expect(actions.delete(deleteEvent('bob'))).resolves.toMatchObject({ status: 500 });
		expect(world.invalidations).toBe(0);
	});
});
