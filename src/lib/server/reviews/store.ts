import type { Filter, ObjectId } from 'mongodb';
import { Context, Effect, Layer } from 'effect';
import type { BarReview, BarReviewUpdate, ReviewChangeLogEntry } from '$lib/types/bar-review';
import { Mongo, tryMongo, type MongoError } from '$lib/server/platform/mongo';
import {
	ACTIVE_REVIEW_FILTER,
	publishDraftReview,
	withReviewVisibility,
	type PublishDraftReviewResult
} from '$lib/server/review-publication';
import { softDeleteReview, type SoftDeleteReviewResult } from '$lib/server/review-deletion';

export type ReviewUpdate = BarReviewUpdate & { changeLog: ReviewChangeLogEntry[] };

/**
 * Review documents as the write workflows and detail reads need them. Visibility rules stay in
 * `review-publication.ts`; this service only runs them against MongoDB.
 */
export class ReviewStore extends Context.Service<
	ReviewStore,
	{
		/** Drafts only for authenticated viewers; deleted reviews never. */
		findVisibleBySlug(slug: string, authenticated: boolean): Effect.Effect<BarReview | null, MongoError>;
		findActiveBySlug(slug: string): Effect.Effect<BarReview | null, MongoError>;
		findActiveById(id: ObjectId): Effect.Effect<BarReview | null, MongoError>;
		/** Deleted reviews still count: the slug index is unique. */
		findSlugConflict(slug: string, excludeId?: ObjectId): Effect.Effect<BarReview | null, MongoError>;
		findVisible(filter: Filter<BarReview>, authenticated: boolean): Effect.Effect<BarReview[], MongoError>;
		findActive(): Effect.Effect<BarReview[], MongoError>;
		insert(review: BarReview): Effect.Effect<void, MongoError>;
		/** Updates only when `updatedAt` still equals `expectedUpdatedAt`. */
		updateIfUnchanged(
			id: ObjectId,
			update: ReviewUpdate,
			expectedUpdatedAt: Date
		): Effect.Effect<{ matchedCount: number }, MongoError>;
		publishDraft(
			slug: string,
			publisher: string,
			now: Date
		): Effect.Effect<PublishDraftReviewResult, MongoError>;
		softDelete(
			slug: string,
			deletedBy: string,
			now: Date,
			expectedUpdatedAt?: Date
		): Effect.Effect<SoftDeleteReviewResult, MongoError>;
	}
>()('enstorstark/reviews/ReviewStore') {
	static readonly layer = Layer.effect(
		ReviewStore,
		Effect.gen(function* () {
			const { collections } = yield* Mongo;
			const bars = collections.bars;
			return ReviewStore.of({
				findVisibleBySlug: (slug, authenticated) =>
					tryMongo(() => bars.findOne(withReviewVisibility({ slug }, authenticated))),
				findActiveBySlug: (slug) =>
					tryMongo(() => bars.findOne({ $and: [{ slug }, ACTIVE_REVIEW_FILTER] })),
				findActiveById: (id) =>
					tryMongo(() => bars.findOne({ $and: [{ _id: id }, ACTIVE_REVIEW_FILTER] })),
				findSlugConflict: (slug, excludeId) =>
					tryMongo(() => bars.findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })),
				findVisible: (filter, authenticated) =>
					tryMongo(() => bars.find(withReviewVisibility(filter, authenticated)).toArray()),
				findActive: () => tryMongo(() => bars.find(ACTIVE_REVIEW_FILTER).toArray()),
				insert: (review) => tryMongo(() => bars.insertOne(review)).pipe(Effect.asVoid),
				updateIfUnchanged: (id, update, expectedUpdatedAt) =>
					tryMongo(() =>
						bars.updateOne(
							{ _id: id, updatedAt: expectedUpdatedAt, deletedAt: { $exists: false } },
							{ $set: update }
						)
					),
				publishDraft: (slug, publisher, now) =>
					tryMongo(() => publishDraftReview(bars, slug, publisher, now)),
				softDelete: (slug, deletedBy, now, expectedUpdatedAt) =>
					tryMongo(() => softDeleteReview(bars, slug, deletedBy, now, expectedUpdatedAt))
			});
		})
	);
}
