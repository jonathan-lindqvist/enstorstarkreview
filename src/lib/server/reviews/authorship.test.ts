import { buildReviewAuthorship, validateReviewAuthors } from '$lib/server/reviews/authorship';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

// Resolves to the rejection, or null when the selection is valid.
const validate = (...args: Parameters<typeof validateReviewAuthors>) =>
	Effect.runPromise(validateReviewAuthors(...args).pipe(Effect.as(null), Effect.flip, Effect.orElseSucceed(() => null)));
const found = (usernames: string[]) => () => Effect.succeed(usernames);

describe('authorship', () => {
	it('makes a selected editor primary and stores only the other selections as co-authors', () => {
		expect(
			buildReviewAuthorship(['bob', 'editor', 'bob'], 'editor', {
				author: 'removed',
				coAuthors: ['bob']
			})
		).toEqual({ author: 'editor', coAuthors: ['bob'] });
	});

	it('retains a selected existing primary when the editor opts out', () => {
		expect(
			buildReviewAuthorship(['bob', 'alice'], 'editor', {
				author: 'alice',
				coAuthors: ['bob']
			})
		).toEqual({ author: 'alice', coAuthors: ['bob'] });
	});

	it('falls back to the first selected existing author in display order', () => {
		expect(
			buildReviewAuthorship(['adam', 'bob', 'zoe'], 'editor', {
				author: 'removed',
				coAuthors: ['zoe', 'bob']
			})
		).toEqual({ author: 'zoe', coAuthors: ['bob', 'adam'] });
	});

	it('falls back to alphabetical display order when no existing author is selected', () => {
		expect(
			buildReviewAuthorship(['zoe', 'adam', 'bob'], 'editor', {
				author: 'removed'
			})
		).toEqual({ author: 'adam', coAuthors: ['bob', 'zoe'] });
		expect(buildReviewAuthorship(['zoe', 'adam'], 'editor')).toEqual({
			author: 'adam',
			coAuthors: ['zoe']
		});
	});

	it('validateReviewAuthors rejects unknown authors', async () => {
		await expect(validate(['sara', 'bob'], found(['sara']))).resolves.toMatchObject({
			pointer: '/authors',
			message: 'En eller flera författare är ogiltiga'
		});
		await expect(validate(['sara'], found(['sara']))).resolves.toBeNull();
	});

	it('validates new selections but allows credited users that no longer exist', async () => {
		const loadUsers = vi.fn(() => Effect.succeed(['new-user']));
		const existing = { author: 'deleted-primary', coAuthors: ['deleted-coauthor'] };
		await expect(
			validate(['deleted-primary', 'deleted-coauthor', 'new-user'], loadUsers, existing)
		).resolves.toBeNull();
		expect(loadUsers).toHaveBeenCalledWith(['new-user']);
		loadUsers.mockClear();
		await expect(validate(['deleted-coauthor'], loadUsers, existing)).resolves.toBeNull();
		expect(loadUsers).not.toHaveBeenCalled();
		await expect(validate(['unknown'], loadUsers, existing)).resolves.toMatchObject({
			pointer: '/authors'
		});
		await expect(validate([], loadUsers, existing)).resolves.toMatchObject({
			pointer: '/authors',
			message: 'Välj minst en författare'
		});
	});
});
