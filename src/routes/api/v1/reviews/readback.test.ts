import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewETag } from '$lib/server/api/reviews';
import { ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { POST } from './+server';
import { PUT } from './[slug]/+server';
import { POST as publish } from './[slug]/publication/+server';

const mocks = vi.hoisted(() => ({
	findOne: vi.fn(),
	create: vi.fn(),
	edit: vi.fn(),
	publish: vi.fn()
}));
vi.mock('$lib/db/bars', () => ({ bars: { findOne: mocks.findOne } }));
vi.mock('$lib/server/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('$lib/server/reviews/create', () => ({ createDraftReview: mocks.create }));
vi.mock('$lib/server/reviews/edit', () => ({ editReview: mocks.edit }));
vi.mock('$lib/server/reviews/publish', () => ({ publishReview: mocks.publish }));
vi.mock('$lib/server/reviews/production', () => ({
	createReviewDependencies: {},
	editReviewDependencies: {},
	publishReviewDependencies: {}
}));

const review = createExistingReview({ publicationStatus: 'draft' });
const validBody = {
	title: review.title,
	description: review.description,
	location: review.location,
	slug: review.slug,
	ratings: {
		atmosphere: 4,
		service: 4,
		selection: 3,
		quality: 5,
		price: 3,
		cleanliness: 4,
		soundLevel: 2,
		barhopPotential: 5
	},
	beer: { brand: 'Falcon Export', priceKr: 59, isHappyHourPrice: false },
	authors: ['current'],
	imageFocus: { x: 30, y: 60 }
};

const eventFor = (path: string, method: string, body?: unknown) => {
	const url = new URL(`http://localhost/api/v1/reviews${path}`);
	return {
		request: new Request(url, {
			method,
			headers: { 'content-type': 'application/json', 'if-match': reviewETag(review) },
			body: body === undefined ? undefined : JSON.stringify(body)
		}),
		url,
		params: { slug: review.slug },
		locals: { user: { username: 'current' } },
		getClientAddress: () => '203.0.113.10'
	} as unknown as Parameters<typeof POST>[0];
};

const operations = [
	{
		operation: 'create',
		handle: POST,
		path: '',
		method: 'POST',
		body: { ...validBody, image: { contentType: 'image/png', data: 'AA==' } },
		status: 201
	},
	{
		operation: 'edit',
		handle: PUT,
		path: '/focus-bar',
		method: 'PUT',
		body: validBody,
		status: 200
	},
	{
		operation: 'publish',
		handle: publish,
		path: '/focus-bar/publication',
		method: 'POST',
		body: undefined,
		status: 200
	}
] as const;

describe('API review write responses', () => {
	beforeEach(() => vi.resetAllMocks());

	it.each(operations)(
		'$operation fails closed if the review was deleted before readback',
		async ({ operation, handle, path, method, body }) => {
			let removed = false;
			mocks[operation].mockImplementation(async () => {
				removed = true;
				return { ok: true, slug: review.slug };
			});
			mocks.findOne.mockImplementation(async (filter) => {
				if (!removed) return review;
				return filter.$and?.includes(ACTIVE_REVIEW_FILTER)
					? null
					: { ...review, deletedAt: new Date() };
			});

			const response = await handle(eventFor(path, method, body));

			expect(mocks[operation]).toHaveBeenCalledTimes(1);
			expect(response.status).toBe(500);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.get('etag')).toBeNull();
			expect(await response.json()).toMatchObject({ code: 'internal_error' });
		}
	);

	it.each(operations)(
		'$operation still returns the active review and ETag',
		async ({ operation, handle, path, method, body, status }) => {
			const saved = { ...review, updatedAt: new Date('2026-01-03T00:00:00Z') };
			if (operation === 'publish') saved.publicationStatus = 'published';
			mocks[operation].mockResolvedValue({ ok: true, slug: saved.slug });
			mocks.findOne.mockResolvedValue(saved);
			if (operation === 'edit') mocks.findOne.mockResolvedValueOnce(review);

			const response = await handle(eventFor(path, method, body));

			expect(response.status).toBe(status);
			expect(response.headers.get('etag')).toBe(reviewETag(saved));
			expect(await response.json()).toMatchObject({
				slug: saved.slug,
				publicationStatus: saved.publicationStatus
			});
		}
	);
});
