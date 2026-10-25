import { Exit } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failureOf, makeTestWorld, runWorkflow } from '$lib/server/testing';
import { createDraftReview } from './create';
import { editReview } from './edit';
import { publishReview } from './publish';
import { createExistingReview, createValidReviewForm } from './test-fixtures';

const imageFile = () => new File([new Uint8Array([1, 2, 3])], 'bar.jpg', { type: 'image/jpeg' });
const createForm = (overrides: Record<string, string> = {}) => {
	const form = createValidReviewForm(overrides);
	form.set('image', imageFile());
	return form;
};
const editForm = (id: string, overrides: Record<string, string> = {}) => {
	const form = createValidReviewForm(overrides);
	form.set('id', id);
	return form;
};

afterEach(() => vi.restoreAllMocks());

describe('review write workflows', () => {
	it('rejects invalid volume before image work, persistence or cache invalidation', async () => {
		const existing = createExistingReview();
		const world = makeTestWorld({ reviews: [existing] });
		const create = createForm();
		create.set('beer-volume', '33.5');
		const edit = editForm(existing._id.toHexString());
		edit.set('beer-volume', '33.5');

		for (const exit of [
			await runWorkflow(world, createDraftReview(create)),
			await runWorkflow(world, editReview(edit, existing.slug))
		]) {
			expect(failureOf(exit)).toMatchObject({ _tag: 'ReviewInvalid', pointer: '/beer-volume' });
		}
		expect(world.images.written).toEqual([]);
		expect(world.reviews).toEqual([existing]);
		expect(world.invalidations).toBe(0);
	});

	it('creates a draft with the clock time and audits the author', async () => {
		const world = makeTestWorld();
		const exit = await runWorkflow(world, createDraftReview(createForm()));
		expect(exit).toEqual(Exit.succeed({ slug: 'focus-bar' }));
		expect(world.reviews).toEqual([
			expect.objectContaining({
				slug: 'focus-bar',
				publicationStatus: 'draft',
				image: world.images.written[0]
			})
		]);
		expect(world.audits.at(-1)).toMatchObject({ outcome: 'success', username: 'current' });
	});

	it.each(['existingUsernames', 'findSlugConflict'] as const)(
		'stops before upload when %s fails',
		async (operation) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const world = makeTestWorld({ failing: new Set([operation]) });
			const exit = await runWorkflow(world, createDraftReview(createForm()));
			expect(failureOf(exit)).toMatchObject({
				_tag: 'StorageFailed',
				message: 'Kunde inte skapa recensionen'
			});
			expect(world.images.written).toEqual([]);
			expect(world.audits.at(-1)).toMatchObject({
				reason: operation === 'existingUsernames' ? 'author_validation_failed' : 'slug_check_failed'
			});
		}
	);

	it('rejects a duplicate slug before writing an image', async () => {
		const world = makeTestWorld({ reviews: [createExistingReview()] });
		const exit = await runWorkflow(world, createDraftReview(createForm()));
		expect(failureOf(exit)).toMatchObject({ _tag: 'DuplicateSlug', pointer: '/slug' });
		expect(world.images.written).toEqual([]);
	});

	it('removes the new image when the insert fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const world = makeTestWorld({ failing: new Set(['insert']) });
		const exit = await runWorkflow(world, createDraftReview(createForm()));
		expect(failureOf(exit)).toMatchObject({ _tag: 'StorageFailed' });
		expect(world.images.removed).toEqual(world.images.written);
		expect(world.images.written).toHaveLength(1);
	});

	it('preserves image errors without attempting persistence', async () => {
		const world = makeTestWorld({ rejectImage: 'Bildens innehåll matchar inte filtypen' });
		const exit = await runWorkflow(world, createDraftReview(createForm()));
		expect(failureOf(exit)).toMatchObject({
			_tag: 'ReviewInvalid',
			pointer: '/image',
			message: 'Bildens innehåll matchar inte filtypen'
		});
		expect(world.reviews).toEqual([]);
	});

	it('returns not found before validating editable fields', async () => {
		const world = makeTestWorld();
		const form = editForm(createExistingReview()._id.toHexString(), { address: '' });
		const exit = await runWorkflow(world, editReview(form, 'focus-bar'));
		expect(failureOf(exit)).toMatchObject({
			_tag: 'ReviewNotFound',
			message: 'Recensionen hittades inte'
		});
	});

	it('keeps edit validation order', async () => {
		const existing = createExistingReview();
		const world = makeTestWorld({ reviews: [existing] });
		const form = editForm(existing._id.toHexString(), { address: '', atmosphere: 'invalid' });
		form.delete('authors');
		const exit = await runWorkflow(world, editReview(form, existing.slug));
		expect(failureOf(exit)).toMatchObject({ pointer: '/address' });
		expect(world.images.written).toEqual([]);
	});

	it('retains a credited former user when the editor opts out, without invalidating drafts', async () => {
		const existing = createExistingReview({ author: 'former', publicationStatus: 'draft' });
		const world = makeTestWorld({ reviews: [existing], usernames: [] });
		const form = editForm(existing._id.toHexString());
		form.set('authors', 'former');
		const exit = await runWorkflow(world, editReview(form, existing.slug));
		expect(exit).toEqual(Exit.succeed({ slug: existing.slug }));
		expect(world.reviews[0]).toMatchObject({ author: 'former', coAuthors: [] });
		expect(world.invalidations).toBe(0);
	});

	it('rejects a stale API version before image processing or persistence', async () => {
		const existing = createExistingReview();
		const world = makeTestWorld({ reviews: [existing] });
		const form = editForm(existing._id.toHexString());
		form.set('image', imageFile());
		const exit = await runWorkflow(
			world,
			editReview(form, existing.slug, { expectedUpdatedAt: new Date('2026-01-01T00:00:00Z') })
		);
		expect(failureOf(exit)).toMatchObject({ _tag: 'PreconditionFailed' });
		expect(world.images.written).toEqual([]);
		expect(world.reviews[0]).toEqual(existing);
	});

	it('removes the new image when another writer wins the conditional update', async () => {
		const existing = createExistingReview({ publicationStatus: 'published' });
		const world = makeTestWorld({ reviews: [existing] });
		const form = editForm(existing._id.toHexString());
		form.set('image', imageFile());
		// A parallel write lands between the read and the conditional update.
		world.beforeUpdate = () => {
			world.reviews[0] = { ...existing, updatedAt: new Date('2026-01-05T00:00:00Z') };
		};
		const exit = await runWorkflow(world, editReview(form, existing.slug));
		expect(failureOf(exit)).toMatchObject({ _tag: 'ConcurrentUpdate' });
		expect(world.images.removed).toEqual(world.images.written);
		expect(world.invalidations).toBe(0);
		expect(world.audits).not.toContainEqual(expect.objectContaining({ outcome: 'success' }));
	});

	it('invalidates public views when a published review is edited', async () => {
		const existing = createExistingReview({ publicationStatus: 'published' });
		const world = makeTestWorld({ reviews: [existing] });
		const exit = await runWorkflow(
			world,
			editReview(editForm(existing._id.toHexString()), existing.slug)
		);
		expect(Exit.isSuccess(exit)).toBe(true);
		expect(world.invalidations).toBe(1);
	});
});

describe('review publication workflow', () => {
	it('publishes a draft, refreshes public views and audits', async () => {
		const world = makeTestWorld({
			reviews: [createExistingReview({ publicationStatus: 'draft' })]
		});
		const exit = await runWorkflow(world, publishReview('focus-bar'));
		expect(exit).toEqual(Exit.succeed({ slug: 'focus-bar' }));
		expect(world.reviews[0].publicationStatus).toBe('published');
		expect(world.invalidations).toBe(1);
		expect(world.audits.map((event) => event.outcome)).toEqual(['attempt', 'success']);
	});

	it.each([
		[null, 'ReviewNotFound', 'invalid_slug'],
		['missing', 'ReviewNotFound', 'review_not_found'],
		['focus-bar', 'AlreadyPublished', 'already_published']
	])('rejects %s with %s', async (slug, tag, reason) => {
		const world = makeTestWorld({
			reviews: [createExistingReview({ publicationStatus: 'published' })]
		});
		const exit = await runWorkflow(world, publishReview(slug));
		expect(failureOf(exit)).toMatchObject({ _tag: tag });
		expect(world.invalidations).toBe(0);
		expect(world.audits.at(-1)).toMatchObject({ outcome: 'failure', reason });
	});
});
