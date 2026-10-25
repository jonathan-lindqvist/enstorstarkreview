import { Effect } from 'effect';
import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { Mongo } from '$lib/server/platform/mongo';
import { ACTIVE_REVIEW_FILTER, PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';
import { UserStore } from '$lib/server/users';
import { ReviewStore } from './store';

// The MongoDB adapters, over stub collections: the queries carry the visibility rules.
const bars = () => ({
	findOne: vi.fn().mockResolvedValue(null),
	find: vi.fn().mockReturnValue({ toArray: async () => [] }),
	insertOne: vi.fn().mockResolvedValue({}),
	updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 })
});

const withStore = <A, E>(
	collection: ReturnType<typeof bars>,
	use: (store: ReviewStore['Service']) => Effect.Effect<A, E>
) =>
	Effect.runPromise(
		ReviewStore.use(use).pipe(
			Effect.provide(ReviewStore.layer),
			Effect.provide(Mongo.layerTest({ bars: collection as never }))
		)
	);

describe('review store', () => {
	it('applies public or active visibility to every read', async () => {
		const collection = bars();
		const id = new ObjectId();
		await withStore(collection, (store) =>
			Effect.all([
				store.findVisibleBySlug('baren', false),
				store.findVisibleBySlug('baren', true),
				store.findActiveBySlug('baren'),
				store.findActiveById(id),
				store.findVisible({ rating: 3 }, false),
				store.findActive()
			])
		);
		expect(collection.findOne.mock.calls.map(([filter]) => filter)).toEqual([
			{ $and: [{ slug: 'baren' }, PUBLIC_REVIEW_FILTER] },
			{ $and: [{ slug: 'baren' }, ACTIVE_REVIEW_FILTER] },
			{ $and: [{ slug: 'baren' }, ACTIVE_REVIEW_FILTER] },
			{ $and: [{ _id: id }, ACTIVE_REVIEW_FILTER] }
		]);
		expect(collection.find.mock.calls.map(([filter]) => filter)).toEqual([
			{ $and: [{ rating: 3 }, PUBLIC_REVIEW_FILTER] },
			ACTIVE_REVIEW_FILTER
		]);
	});

	it('checks slug conflicts across deleted reviews, excluding the edited one', async () => {
		const collection = bars();
		const id = new ObjectId();
		await withStore(collection, (store) =>
			Effect.all([store.findSlugConflict('baren'), store.findSlugConflict('baren', id)])
		);
		expect(collection.findOne.mock.calls.map(([filter]) => filter)).toEqual([
			{ slug: 'baren' },
			{ slug: 'baren', _id: { $ne: id } }
		]);
	});

	it('updates only the unchanged active version', async () => {
		const collection = bars();
		const id = new ObjectId();
		const seen = new Date(1000);
		const result = await withStore(collection, (store) =>
			store.updateIfUnchanged(id, { title: 'Ny' } as never, seen)
		);
		expect(result).toEqual({ matchedCount: 1 });
		expect(collection.updateOne).toHaveBeenCalledWith(
			{ _id: id, updatedAt: seen, deletedAt: { $exists: false } },
			{ $set: { title: 'Ny' } }
		);
	});

	it('turns driver failures into MongoError without leaking them as defects', async () => {
		const collection = bars();
		collection.insertOne.mockRejectedValue(new Error('disk on fire'));
		const error = await withStore(collection, (store) => Effect.flip(store.insert({} as never)));
		expect(error).toMatchObject({ _tag: 'MongoError' });
	});
});

describe('user store', () => {
	const users = [
		{ _id: new ObjectId(), username: 'Örjan' },
		{ _id: new ObjectId(), username: 'anna' },
		{ _id: new ObjectId(), username: 'Zelda' }
	];
	const run = <A, E>(use: (store: UserStore['Service']) => Effect.Effect<A, E>) => {
		const collection = {
			findOne: vi.fn().mockResolvedValue(users[1]),
			find: vi.fn((filter: { username?: { $in: string[] } }) => ({
				toArray: async () =>
					filter.username ? users.filter((u) => filter.username!.$in.includes(u.username)) : users
			}))
		};
		return Effect.runPromise(
			UserStore.use(use).pipe(
				Effect.provide(UserStore.layer),
				Effect.provide(Mongo.layerTest({ users: collection as never }))
			)
		);
	};

	it('sorts usernames with Swedish collation and returns only existing selections', async () => {
		expect(await run((store) => store.listUsernames())).toEqual(['anna', 'Zelda', 'Örjan']);
		expect(await run((store) => store.existingUsernames(['anna', 'ghost']))).toEqual(['anna']);
		expect(await run((store) => store.findByUsername('anna'))).toBe(users[1]);
		expect(await run((store) => store.listAuthorOptions())).toEqual(
			users.map((user) => ({ _id: user._id.toString(), username: user.username }))
		);
	});
});
