import { Context, Effect, Layer } from 'effect';
import type { User } from '$lib/types/user';
import { Mongo, tryMongo, type MongoError } from '$lib/server/platform/mongo';

export interface AuthorOption {
	_id: string;
	username: string;
}

/** Reviewer accounts. Usernames are public to signed-in reviewers; passwords never leave. */
export class UserStore extends Context.Service<
	UserStore,
	{
		findByUsername(username: string): Effect.Effect<User | null, MongoError>;
		/** The subset of `usernames` that belongs to existing accounts. */
		existingUsernames(usernames: string[]): Effect.Effect<string[], MongoError>;
		/** Every username, sorted with Swedish collation. */
		listUsernames(): Effect.Effect<string[], MongoError>;
		listAuthorOptions(): Effect.Effect<AuthorOption[], MongoError>;
	}
>()('enstorstark/server/UserStore') {
	static readonly layer = Layer.effect(
		UserStore,
		Effect.gen(function* () {
			const { users } = (yield* Mongo).collections;
			return UserStore.of({
				findByUsername: (username) => tryMongo(() => users.findOne({ username })),
				existingUsernames: (usernames) =>
					tryMongo(() =>
						users.find({ username: { $in: usernames } }, { projection: { username: 1 } }).toArray()
					).pipe(Effect.map((found) => found.map((user) => user.username))),
				listUsernames: () =>
					tryMongo(() => users.find({}, { projection: { username: 1 } }).toArray()).pipe(
						Effect.map((found) =>
							found
								.map((user) => user.username)
								.toSorted((first, second) => first.localeCompare(second, 'sv'))
						)
					),
				listAuthorOptions: () =>
					tryMongo(() => users.find({}, { projection: { username: 1 } }).toArray()).pipe(
						Effect.map((found) =>
							found.map((user) => ({ _id: user._id.toString(), username: user.username }))
						)
					)
			});
		})
	);
}
