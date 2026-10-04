import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { createReviewRatingValues } from '$lib/review-metadata';
import type { BarReview } from '$lib/types/bar-review';

const mocks = vi.hoisted(() => ({
	findOne: vi.fn(),
	insertOne: vi.fn(),
	updateOne: vi.fn(),
	users: vi.fn(),
	audit: vi.fn(),
	upload: vi.fn(),
	cleanup: vi.fn(),
	statistics: vi.fn(),
	map: vi.fn()
}));
vi.mock('$lib/db/bars', () => ({ bars: mocks }));
vi.mock('$lib/db/users', () => ({ users: { find: () => ({ toArray: mocks.users }) } }));
vi.mock('$lib/server/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('$lib/server/request', () => ({ getRequestIp: () => 'test-ip' }));
vi.mock('$lib/server/review-images', () => ({
	uploadReviewImage: mocks.upload,
	cleanupReviewImageUpload: mocks.cleanup
}));
vi.mock('$lib/server/review-statistics', () => ({
	invalidatePublicReviewStatisticsCache: mocks.statistics
}));
vi.mock('$lib/server/review-map', () => ({ invalidatePublicReviewMapCache: mocks.map }));

import { actions as createActions } from './admin/reviews/create/+page.server';
import { actions as editActions } from './[slug]/edit/+page.server';

const id = new ObjectId();
const existing: BarReview = {
	_id: id,
	title: 'Baren',
	description: 'Beskrivning',
	location: 'Gatan 1',
	slug: 'baren',
	...createReviewRatingValues(3),
	rating: 2,
	image: 'old.jpg',
	author: 'editor',
	coAuthors: [],
	publicationStatus: 'draft',
	createdAt: new Date(0),
	updatedAt: new Date(0)
};
const upload = { filename: 'new.jpg', path: '/tmp/new.jpg' };
const form = () => {
	const data = new FormData();
	for (const [key, value] of Object.entries({
		id: id.toHexString(),
		'bar-name': 'Baren',
		description: 'Beskrivning',
		address: 'Gatan 1',
		slug: 'baren',
		'beer-brand': 'Falcon Export',
		'beer-price': '65',
		authors: 'editor',
		...createReviewRatingValues(3),
		rating: 2
	}))
		data.set(key, String(value));
	return data;
};
const event = <T>(data = form(), authenticated = true): T =>
	({
		request: { formData: async () => data },
		locals: { user: authenticated ? { username: 'editor' } : null },
		params: { slug: 'baren' }
	}) as unknown as T;

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.users.mockResolvedValue([{ username: 'editor' }]);
	mocks.findOne.mockResolvedValue(null);
	mocks.upload.mockResolvedValue({ ok: true, upload });
});

describe('review action contracts', () => {
	it('denies unauthenticated writes before parsing or uploading', async () => {
		for (const action of [createActions.default!, editActions.default!]) {
			const result = await action(event(form(), false));
			expect(result).toMatchObject({ status: 401, data: { message: 'Du är inte inloggad' } });
		}
		expect(mocks.upload).not.toHaveBeenCalled();
		expect(mocks.findOne).not.toHaveBeenCalled();
	});
	it('creates only a draft, then audits success and redirects', async () => {
		const data = form();
		data.set('publicationStatus', 'published');
		await expect(createActions.default!(event(data))).rejects.toMatchObject({
			status: 303,
			location: '/baren'
		});
		expect(mocks.insertOne).toHaveBeenCalledWith(
			expect.objectContaining({
				publicationStatus: 'draft',
				author: 'editor',
				changeLog: [],
				image: 'new.jpg'
			})
		);
		expect(mocks.audit.mock.calls.map(([entry]) => entry.outcome)).toEqual(['attempt', 'success']);
		expect(mocks.audit.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
			mocks.insertOne.mock.invocationCallOrder[0]
		);
		expect(mocks.map).not.toHaveBeenCalled();
	});
	it('retains create validation precedence and an empty author selection', async () => {
		const data = form();
		data.delete('authors');
		data.set('address', '');
		data.set('atmosphere', 'invalid');
		const result = await createActions.default!(event(data));
		expect(result).toMatchObject({
			status: 400,
			data: { authors: [], pointer: '/', message: expect.stringContaining('Ogiltiga betyg') }
		});
		expect(mocks.upload).not.toHaveBeenCalled();
	});
	it('rejects a conflicting slug before uploading', async () => {
		mocks.findOne.mockResolvedValue(existing);
		expect(await createActions.default!(event())).toMatchObject({
			status: 400,
			data: { pointer: '/slug', message: 'En bar med den här sluggen finns redan' }
		});
		expect(mocks.upload).not.toHaveBeenCalled();
	});
	it.each([{ code: 11000 }, new Error('write failed')])(
		'cleans up an upload when creation fails: %s',
		async (error) => {
			mocks.insertOne.mockRejectedValue(error);
			expect(await createActions.default!(event())).toMatchObject({ status: 400 });
			expect(mocks.cleanup).toHaveBeenCalledWith(upload);
			expect(mocks.audit).toHaveBeenLastCalledWith(
				expect.objectContaining({
					outcome: 'failure',
					reason: 'code' in error ? 'duplicate_slug_insert' : 'insert_failed'
				})
			);
		}
	);
	it('rejects a mismatched edit route before validation or upload', async () => {
		mocks.findOne.mockResolvedValue({ ...existing, slug: 'another' });
		expect(await editActions.default!(event())).toMatchObject({
			status: 400,
			data: { pointer: '/', message: 'Ogiltiga formulärdata' }
		});
		expect(mocks.upload).not.toHaveBeenCalled();
		expect(mocks.audit).toHaveBeenLastCalledWith(
			expect.objectContaining({ outcome: 'denied', reason: 'route_slug_mismatch' })
		);
	});
	it.each(['draft', 'published', undefined] as const)(
		'preserves publication state and invalidates only public edits: %s',
		async (publicationStatus) => {
			mocks.findOne
				.mockResolvedValueOnce({ ...existing, publicationStatus })
				.mockResolvedValueOnce(null);
			mocks.upload.mockResolvedValue({ ok: true, upload: null });
			const data = form();
			data.set('publicationStatus', 'published');
			await expect(editActions.default!(event(data))).rejects.toMatchObject({
				status: 303,
				location: '/baren'
			});
			const update = mocks.updateOne.mock.calls[0][1].$set;
			expect(update).not.toHaveProperty('publicationStatus');
			expect(update).not.toHaveProperty('image');
			expect(mocks.map).toHaveBeenCalledTimes(publicationStatus === 'draft' ? 0 : 1);
			expect(mocks.statistics).toHaveBeenCalledTimes(publicationStatus === 'draft' ? 0 : 1);
		}
	);
	it('cleans up a replacement image on duplicate edit without invalidating caches', async () => {
		mocks.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
		mocks.updateOne.mockRejectedValue({ code: 11000 });
		expect(await editActions.default!(event())).toMatchObject({
			status: 400,
			data: { pointer: '/slug', message: 'Sluggen finns redan' }
		});
		expect(mocks.cleanup).toHaveBeenCalledWith(upload);
		expect(mocks.map).not.toHaveBeenCalled();
	});
});
