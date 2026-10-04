import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftReview } from './create';
import { createValidReviewForm } from './test-fixtures';
import type { CreateReviewDependencies, EditReviewDependencies } from './write-dependencies';

const now = new Date('2026-01-03T00:00:00Z');
const context = { username: 'current', ip: 'test-ip' };
const dependencies = () =>
	({
		loadValidUsernames: vi.fn().mockResolvedValue(['current']),
		findSlugConflict: vi.fn().mockResolvedValue(null),
		uploadImage: vi
			.fn()
			.mockResolvedValue({ ok: true, upload: { filename: 'new.jpg', path: '/tmp/new.jpg' } }),
		cleanupImage: vi.fn(),
		audit: vi.fn().mockResolvedValue(undefined),
		now: () => now,
		insertReview: vi.fn().mockResolvedValue(undefined),
		findReview: vi.fn().mockResolvedValue(null),
		updateReview: vi.fn().mockResolvedValue(undefined),
		invalidatePublicViews: vi.fn()
	}) satisfies CreateReviewDependencies & EditReviewDependencies;

afterEach(() => vi.restoreAllMocks());

describe('review write workflows', () => {
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
	it.each(['loadValidUsernames', 'findSlugConflict'] as const)(
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
});
