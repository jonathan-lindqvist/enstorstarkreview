import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReviewRatingValues } from '$lib/review-metadata';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { makeTestWorld, useTestApp, webEvent, type TestWorld } from '$lib/server/testing';
import type { BarReview } from '$lib/types/bar-review';
import { actions as createActions, load as createLoad } from './admin/reviews/create/+page.server';
import { actions as editActions, load as editLoad } from './[slug]/edit/+page.server';
import { load as wizardLoad } from './admin/reviews/create/wizard/+page.server';

// The routes run on in-memory review services; only the comparison reads touch stub collections.
const existing: BarReview = createExistingReview({
	title: 'Baren',
	location: 'Gatan 1',
	slug: 'baren',
	author: 'editor',
	publicationStatus: 'draft'
});
const imageFile = () =>
	new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bar.jpg', { type: 'image/jpeg' });
const form = (overrides: Record<string, string> = {}) => {
	const data = new FormData();
	for (const [key, value] of Object.entries({
		id: existing._id.toHexString(),
		'bar-name': 'Baren',
		description: 'Beskrivning',
		address: 'Gatan 1',
		slug: 'baren',
		'beer-brand': 'Falcon Export',
		'beer-price': '65',
		authors: 'editor',
		...createReviewRatingValues(3),
		rating: 2,
		...overrides
	}))
		data.set(key, String(value));
	data.set('image', imageFile());
	return data;
};
const event = <T>(data = form(), authenticated = true) => {
	const input = webEvent<T>({
		url: '/baren/edit',
		method: 'POST',
		user: authenticated ? { username: 'editor' } : null,
		params: { slug: 'baren' }
	});
	(input as { request: Request }).request = { formData: async () => data } as unknown as Request;
	return input;
};

const mocks = { find: vi.fn() };
let world: TestWorld;
let restore: () => Promise<void>;

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.find.mockReset().mockReturnValue({ toArray: async () => [] });
	world = makeTestWorld({ usernames: ['editor'] });
	restore = useTestApp(world, {
		collections: { bars: { find: mocks.find } as never, mapGeocodes: { find: mocks.find } as never }
	});
});
afterEach(async () => {
	vi.restoreAllMocks();
	await restore();
});

describe('review action contracts', () => {
	it('denies anonymous comparison reads in both forms before queries', async () => {
		world.reviews.push(existing);
		for (const load of [createLoad, editLoad, wizardLoad]) {
			await expect(load(event(form(), false) as never)).rejects.toMatchObject({
				status: 302,
				location: '/login'
			});
		}
		expect(mocks.find).not.toHaveBeenCalled();
		expect(world.audits.map((entry) => entry.outcome)).toEqual(['denied', 'denied', 'denied']);
	});

	it('loads comparison only for an authenticated editor and excludes the edited review', async () => {
		const other = createExistingReview({ slug: 'annan', location: 'Gatan 2' });
		mocks.find.mockImplementation((filter: { addressKey?: unknown }) => ({
			toArray: async () => (filter.addressKey ? [] : [existing, other])
		}));
		world.reviews.push(existing);

		const created = await createLoad(event() as never);
		expect(created).toMatchObject({ nearbyComparison: { available: true } });
		expect(
			(
				created as { nearbyComparison: { reviews: { slug: string }[] } }
			).nearbyComparison.reviews.map((r) => r.slug)
		).toEqual(['baren', 'annan']);

		const edited = await editLoad(event() as never);
		expect(
			(
				edited as { nearbyComparison: { reviews: { slug: string }[] } }
			).nearbyComparison.reviews.map((r) => r.slug)
		).toEqual(['annan']);
	});

	it('denies unauthenticated writes before parsing or uploading', async () => {
		world.reviews.push(existing);
		for (const action of [createActions.default!, editActions.default!]) {
			const result = await action(event(form(), false) as never);
			expect(result).toMatchObject({ status: 401, data: { message: 'Du är inte inloggad' } });
		}
		expect(world.images.written).toEqual([]);
		expect(world.reviews).toEqual([existing]);
	});

	it('creates only a draft, then audits success and redirects', async () => {
		await expect(
			createActions.default!(event(form({ publicationStatus: 'published' })) as never)
		).rejects.toMatchObject({ status: 303, location: '/baren' });
		expect(world.reviews).toEqual([
			expect.objectContaining({
				publicationStatus: 'draft',
				author: 'editor',
				changeLog: [],
				image: world.images.written[0]
			})
		]);
		expect(world.audits.map((entry) => entry.outcome)).toEqual(['attempt', 'success']);
		expect(world.invalidations).toBe(0);
	});

	it('retains create validation precedence and an empty author selection', async () => {
		const data = form({ address: '', atmosphere: 'invalid' });
		data.delete('authors');
		const result = await createActions.default!(event(data) as never);
		expect(result).toMatchObject({
			status: 400,
			data: { authors: [], pointer: '/', message: expect.stringContaining('Ogiltiga betyg') }
		});
		expect(world.images.written).toEqual([]);
	});

	it('rejects a conflicting slug before uploading', async () => {
		world.reviews.push(existing);
		expect(await createActions.default!(event() as never)).toMatchObject({
			status: 400,
			data: { pointer: '/slug', message: 'En bar med den här sluggen finns redan' }
		});
		expect(world.images.written).toEqual([]);
	});

	it('cleans up an upload when creation fails', async () => {
		world.failing.add('insert');
		expect(await createActions.default!(event() as never)).toMatchObject({ status: 400 });
		expect(world.images.removed).toEqual(world.images.written);
		expect(world.images.written).toHaveLength(1);
		expect(world.audits.at(-1)).toMatchObject({ outcome: 'failure', reason: 'insert_failed' });
	});

	it('rejects a mismatched edit route before validation or upload', async () => {
		world.reviews.push({ ...existing, slug: 'another' });
		expect(await editActions.default!(event() as never)).toMatchObject({
			status: 400,
			data: { pointer: '/', message: 'Ogiltiga formulärdata' }
		});
		expect(world.images.written).toEqual([]);
		expect(world.audits.at(-1)).toMatchObject({ outcome: 'denied', reason: 'route_slug_mismatch' });
	});

	it.each(['draft', 'published', undefined] as const)(
		'preserves publication state and invalidates only public edits: %s',
		async (publicationStatus) => {
			world.reviews.push({ ...existing, publicationStatus });
			const data = form({ publicationStatus: 'published' });
			data.delete('image');
			await expect(editActions.default!(event(data) as never)).rejects.toMatchObject({
				status: 303,
				location: '/baren'
			});
			expect(world.reviews[0].publicationStatus).toBe(publicationStatus);
			expect(world.reviews[0].image).toBe(existing.image);
			expect(world.invalidations).toBe(publicationStatus === 'draft' ? 0 : 1);
		}
	);

	it('cleans up a replacement image on a parallel edit without invalidating caches', async () => {
		world.reviews.push({ ...existing, publicationStatus: 'published' });
		world.beforeUpdate = () => {
			world.reviews[0] = { ...world.reviews[0], updatedAt: new Date('2026-03-01T00:00:00Z') };
		};
		expect(await editActions.default!(event() as never)).toMatchObject({ status: 409 });
		expect(world.images.removed).toEqual(world.images.written);
		expect(world.invalidations).toBe(0);
	});
});

describe('review form duplicate slugs', () => {
	it('answers a duplicate edit slug with 400 and restores the form', async () => {
		world.reviews.push(existing, createExistingReview({ slug: 'upptagen' }));
		const data = form({ slug: 'upptagen' });
		data.delete('image');
		expect(await editActions.default!(event(data) as never)).toMatchObject({
			status: 400,
			data: { pointer: '/slug', message: 'Sluggen finns redan', slug: 'upptagen' }
		});
	});
});
