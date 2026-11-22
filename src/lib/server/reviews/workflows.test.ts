import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftReview } from './create';
import { editReview } from './edit';
import { createExistingReview, createValidReviewForm } from './test-fixtures';
import type { CreateReviewDependencies, EditReviewDependencies } from './write-dependencies';

const now = new Date('2026-01-03T00:00:00Z');
const context = { username: 'current', ip: 'test-ip' };
const dependencies = () =>
	({
		loadValidUsernames: vi.fn().mockResolvedValue(['current']),
		isSlugReserved: vi.fn().mockResolvedValue(false),
		uploadImage: vi.fn().mockResolvedValue({
			ok: true,
			upload: {
				filename: 'new.jpg',
				path: '/tmp/new.jpg',
				dimensions: { width: 1200, height: 800 }
			}
		}),
		cleanupImage: vi.fn(),
		audit: vi.fn().mockResolvedValue(undefined),
		now: () => now,
		insertReview: vi.fn().mockResolvedValue(undefined),
		findReview: vi.fn().mockResolvedValue(null),
		updateReview: vi.fn().mockResolvedValue({ matchedCount: 1 }),
		invalidatePublicViews: vi.fn()
	}) satisfies CreateReviewDependencies & EditReviewDependencies;

afterEach(() => vi.restoreAllMocks());

describe('review write workflows', () => {
	it('persists trusted upload dimensions on create and replacement, ignoring form dimensions', async () => {
		const deps = dependencies();
		const dimensions = { width: 1200, height: 800 };
		deps.uploadImage.mockResolvedValue({
			ok: true,
			upload: { filename: 'new.jpg', path: '/tmp/new.jpg', dimensions }
		});
		const data = createValidReviewForm();
		data.set('imageDimensions', '{"width":1,"height":1}');
		expect(await createDraftReview(data, context, deps)).toMatchObject({ ok: true });
		expect(deps.insertReview).toHaveBeenCalledWith(
			expect.objectContaining({ imageDimensions: dimensions })
		);
		const existing = createExistingReview();
		deps.findReview.mockResolvedValue(existing);
		data.set('id', existing._id.toHexString());
		expect(await editReview(data, existing.slug, context, deps)).toMatchObject({ ok: true });
		expect(deps.updateReview).toHaveBeenCalledWith(
			existing._id,
			expect.objectContaining({ imageDimensions: dimensions }),
			existing.updatedAt
		);
	});
	it('preserves existing photo dimensions when no replacement was uploaded', async () => {
		const deps = dependencies();
		const existing = createExistingReview({ imageDimensions: { width: 800, height: 1200 } });
		deps.findReview.mockResolvedValue(existing);
		deps.uploadImage.mockResolvedValue({ ok: true, upload: null });
		const data = createValidReviewForm();
		data.set('id', existing._id.toHexString());
		data.set('imageDimensions', '{"width":1,"height":1}');
		expect(await editReview(data, existing.slug, context, deps)).toMatchObject({ ok: true });
		expect(deps.updateReview.mock.calls[0][1]).not.toHaveProperty('imageDimensions');
		expect(deps.updateReview.mock.calls[0][1]).not.toHaveProperty('image');
	});
	it('rejects invalid volume before image work, persistence or cache invalidation', async () => {
		const deps = dependencies();
		const existing = createExistingReview();
		deps.findReview.mockResolvedValue(existing);
		const data = createValidReviewForm();
		data.set('id', existing._id.toHexString());
		data.set('beer-volume', '33.5');
		for (const result of [
			await createDraftReview(data, context, deps),
			await editReview(data, existing.slug, context, deps)
		]) {
			expect(result).toMatchObject({
				ok: false,
				problem: { status: 400, pointer: '/beer-volume' }
			});
		}
		expect(deps.uploadImage).not.toHaveBeenCalled();
		expect(deps.insertReview).not.toHaveBeenCalled();
		expect(deps.updateReview).not.toHaveBeenCalled();
		expect(deps.invalidatePublicViews).not.toHaveBeenCalled();
	});
	it('uses the supplied time and returns a result without redirecting', async () => {
		const deps = dependencies();
		expect(await createDraftReview(createValidReviewForm(), context, deps)).toEqual({
			ok: true,
			slug: 'focus-bar'
		});
		expect(deps.insertReview).toHaveBeenCalledWith(
			expect.objectContaining({ createdAt: now, updatedAt: now, publicationStatus: 'draft' })
		);
	});
	it.each(['loadValidUsernames', 'isSlugReserved'] as const)(
		'stops before upload when %s fails',
		async (operation) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const deps = dependencies();
			deps[operation].mockRejectedValue(new Error('unavailable'));
			const result = await createDraftReview(createValidReviewForm(), context, deps);
			expect(result).toMatchObject({
				ok: false,
				problem: { status: 400, message: 'Kunde inte skapa recensionen' },
				formData: { authors: ['current'] }
			});
			expect(deps.uploadImage).not.toHaveBeenCalled();
			expect(deps.audit).toHaveBeenLastCalledWith(
				expect.objectContaining({
					reason:
						operation === 'loadValidUsernames' ? 'author_validation_failed' : 'slug_check_failed'
				})
			);
		}
	);
	it('preserves image errors and form values without attempting persistence', async () => {
		const deps = dependencies();
		const problem = {
			status: 400,
			pointer: '/image',
			message: 'Bildens innehåll matchar inte filtypen'
		};
		deps.uploadImage.mockResolvedValue({ ok: false, problem });
		expect(await createDraftReview(createValidReviewForm(), context, deps)).toMatchObject({
			ok: false,
			problem,
			formData: { barName: 'Focus Bar' }
		});
		expect(deps.insertReview).not.toHaveBeenCalled();
	});
	it('returns a missing-review result before validating editable fields', async () => {
		const deps = dependencies();
		const form = createValidReviewForm({ address: '' });
		form.set('id', createExistingReview()._id.toHexString());
		expect(await editReview(form, 'focus-bar', context, deps)).toMatchObject({
			ok: false,
			problem: { status: 404, message: 'Recensionen hittades inte' }
		});
		expect(deps.loadValidUsernames).not.toHaveBeenCalled();
	});
	it('keeps edit validation order and empty submitted selections', async () => {
		const deps = dependencies();
		const existing = createExistingReview();
		deps.findReview.mockResolvedValue(existing);
		const form = createValidReviewForm({ address: '', atmosphere: 'invalid' });
		form.set('id', existing._id.toHexString());
		form.delete('authors');
		expect(await editReview(form, existing.slug, context, deps)).toMatchObject({
			ok: false,
			problem: { pointer: '/address' },
			formData: { authors: [] }
		});
		expect(deps.uploadImage).not.toHaveBeenCalled();
	});
	it('retains a credited former user when the editor opts out, without querying current users', async () => {
		const deps = dependencies();
		const existing = createExistingReview({ author: 'former', publicationStatus: 'draft' });
		deps.findReview.mockResolvedValue(existing);
		const form = createValidReviewForm();
		form.set('id', existing._id.toHexString());
		form.set('authors', 'former');
		expect(await editReview(form, existing.slug, context, deps)).toEqual({
			ok: true,
			slug: existing.slug
		});
		expect(deps.loadValidUsernames).not.toHaveBeenCalled();
		expect(deps.updateReview).toHaveBeenCalledWith(
			existing._id,
			expect.objectContaining({ author: 'former', coAuthors: [], updatedAt: now }),
			existing.updatedAt
		);
		expect(deps.invalidatePublicViews).not.toHaveBeenCalled();
	});
	it('rejects a stale API version before image processing or persistence', async () => {
		const deps = dependencies();
		const existing = createExistingReview();
		deps.findReview.mockResolvedValue(existing);
		const form = createValidReviewForm();
		form.set('id', existing._id.toHexString());
		const result = await editReview(
			form,
			existing.slug,
			{ ...context, expectedUpdatedAt: new Date('2026-01-01T00:00:00Z') },
			deps
		);
		expect(result).toMatchObject({
			ok: false,
			problem: { status: 412, code: 'precondition_failed' }
		});
		expect(deps.uploadImage).not.toHaveBeenCalled();
		expect(deps.updateReview).not.toHaveBeenCalled();
	});
	it('cleans up the new image when another writer wins the conditional update', async () => {
		const deps = dependencies();
		const existing = createExistingReview({ publicationStatus: 'published' });
		deps.findReview.mockResolvedValue(existing);
		deps.updateReview.mockResolvedValue({ matchedCount: 0 });
		const form = createValidReviewForm();
		form.set('id', existing._id.toHexString());
		const result = await editReview(form, existing.slug, context, deps);
		expect(result).toMatchObject({
			ok: false,
			problem: { status: 409, code: 'concurrent_update' }
		});
		expect(deps.cleanupImage).toHaveBeenCalledExactlyOnceWith({
			filename: 'new.jpg',
			path: '/tmp/new.jpg',
			dimensions: { width: 1200, height: 800 }
		});
		expect(deps.invalidatePublicViews).not.toHaveBeenCalled();
		expect(deps.audit).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }));
	});
});
