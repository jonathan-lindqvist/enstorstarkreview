import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import { createReviewRatingValues } from '$lib/review-metadata';
import { ACTIVE_REVIEW_FILTER, PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';

const mocks = vi.hoisted(() => ({
	findOne: vi.fn(),
	updateOne: vi.fn(),
	coordinates: vi.fn(),
	audit: vi.fn()
}));
vi.mock('$lib/db/bars', () => ({ bars: mocks }));
vi.mock('$lib/server/reviews/production', () => ({
	publishReviewDependencies: {},
	deleteReviewDependencies: {}
}));
vi.mock('$lib/server/reviews/coordinates', () => ({ loadReviewCoordinates: mocks.coordinates }));
vi.mock('$lib/server/audit', () => ({ logAuditEvent: mocks.audit }));

import { load } from './[slug]/+page.server';

const review: BarReview = {
	_id: new ObjectId(),
	slug: 'tyrolen-biergarten',
	title: 'Tyrolen Biergarten',
	description: 'En recension.',
	location: 'Göteborg',
	image: 'image.jpg',
	author: 'test',
	rating: 2,
	...createReviewRatingValues(3),
	publicationStatus: 'published',
	createdAt: new Date(0),
	updatedAt: new Date(0)
};

const event = (path: string, slug: string, method = 'GET', authenticated = false) => ({
	url: new URL(`http://untrusted.example${path}`),
	request: new Request(`http://untrusted.example${path}`, { method }),
	params: { slug },
	locals: { user: authenticated ? { username: 'test' } : null },
	setHeaders: vi.fn()
});

beforeEach(() => {
	vi.resetAllMocks();
	mocks.findOne.mockResolvedValue(review);
	mocks.coordinates.mockResolvedValue({});
});

describe('web review canonical redirects', () => {
	it.each(['GET', 'HEAD'])(
		'redirects a visible alias before coordinate work for %s',
		async (method) => {
			await expect(
				load(
					event('/tyrolen--biergarten?utm_source=gsc&x=%2F', 'tyrolen--biergarten', method) as never
				)
			).rejects.toMatchObject({
				status: 308,
				location: '/tyrolen-biergarten?utm_source=gsc&x=%2F'
			});
			expect(mocks.findOne).toHaveBeenCalledWith({
				$and: [{ slug: 'tyrolen-biergarten' }, PUBLIC_REVIEW_FILTER]
			});
			expect(mocks.coordinates).not.toHaveBeenCalled();
			expect(mocks.updateOne).not.toHaveBeenCalled();
			expect(mocks.audit).not.toHaveBeenCalled();
		}
	);

	it('encodes the stored slug in the relative redirect destination', async () => {
		mocks.findOne.mockResolvedValue({ ...review, slug: 'café-bar' });
		await expect(load(event('/caf%C3%A9--bar', 'café--bar') as never)).rejects.toMatchObject({
			status: 308,
			location: '/caf%C3%A9-bar'
		});
	});

	it.each(['tyrolen-biergarten', 'café-bar'])('serves the canonical path for %s', async (slug) => {
		mocks.findOne.mockResolvedValue({ ...review, slug });
		await expect(
			load(event(`/${encodeURIComponent(slug)}?utm_source=gsc`, slug) as never)
		).resolves.toMatchObject({ bar: { slug } });
		expect(mocks.coordinates).toHaveBeenCalledOnce();
	});

	it('keeps legacy public reviews readable through their canonical URL', async () => {
		const legacy = { ...review };
		delete legacy.publicationStatus;
		mocks.findOne.mockResolvedValue(legacy);
		await expect(
			load(event('/tyrolen-biergarten', 'tyrolen-biergarten') as never)
		).resolves.toMatchObject({ bar: { publicationStatus: 'published' } });
	});

	it('does not disclose a redirect destination for a hidden or missing review', async () => {
		mocks.findOne.mockResolvedValue(null);
		await expect(
			load(event('/tyrolen--biergarten', 'tyrolen--biergarten') as never)
		).rejects.toMatchObject({ status: 404 });
		expect(mocks.findOne).toHaveBeenCalledWith({
			$and: [{ slug: 'tyrolen-biergarten' }, PUBLIC_REVIEW_FILTER]
		});
		expect(mocks.coordinates).not.toHaveBeenCalled();
		expect(mocks.updateOne).not.toHaveBeenCalled();
	});

	it.each(['%', '---', 'a'.repeat(201)])(
		'rejects malformed or oversized slug %s before reads',
		async (slug) => {
			await expect(load(event('/invalid', slug) as never)).rejects.toMatchObject({ status: 404 });
			expect(mocks.findOne).not.toHaveBeenCalled();
			expect(mocks.coordinates).not.toHaveBeenCalled();
		}
	);

	it('authorizes a signed-in draft before redirecting its alias', async () => {
		mocks.findOne.mockResolvedValue({ ...review, publicationStatus: 'draft' });
		await expect(
			load(event('/tyrolen--biergarten', 'tyrolen--biergarten', 'GET', true) as never)
		).rejects.toMatchObject({ status: 308, location: '/tyrolen-biergarten' });
		expect(mocks.findOne).toHaveBeenCalledWith({
			$and: [{ slug: 'tyrolen-biergarten' }, ACTIVE_REVIEW_FILTER]
		});
		expect(mocks.coordinates).not.toHaveBeenCalled();
	});

	it('keeps POST action-result loads on the existing path', async () => {
		await expect(
			load(event('/tyrolen--biergarten?/publish', 'tyrolen--biergarten', 'POST', true) as never)
		).resolves.toMatchObject({ bar: { slug: 'tyrolen-biergarten' } });
	});
});
