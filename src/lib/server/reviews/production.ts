import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { logAuditEvent } from '$lib/server/audit';
import { publishDraftReview } from '$lib/server/review-publication';
import { uploadReviewImage, cleanupReviewImageUpload } from '$lib/server/review-images';
import { invalidatePublicReviewCaches } from './public-cache';
import type { PublishReviewDependencies } from './publish';
import type {
	CreateReviewDependencies,
	EditReviewDependencies,
	ReviewWriteDependencies
} from './write-dependencies';

export const reviewWriteDependencies: ReviewWriteDependencies = {
	loadValidUsernames: async (authors) =>
		(
			await users.find({ username: { $in: authors } }, { projection: { username: 1 } }).toArray()
		).map((user) => user.username),
	findSlugConflict: (slug, excludeId) =>
		bars.findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }),
	uploadImage: uploadReviewImage,
	cleanupImage: cleanupReviewImageUpload,
	audit: logAuditEvent,
	now: () => new Date()
};

export const createReviewDependencies: CreateReviewDependencies = {
	...reviewWriteDependencies,
	insertReview: (review) => bars.insertOne(review)
};

export const editReviewDependencies: EditReviewDependencies = {
	...reviewWriteDependencies,
	findReview: (id) => bars.findOne({ _id: id }),
	updateReview: (id, update, expectedUpdatedAt) =>
		bars.updateOne({ _id: id, updatedAt: expectedUpdatedAt }, { $set: update }),
	invalidatePublicViews: invalidatePublicReviewCaches
};

export const publishReviewDependencies: PublishReviewDependencies = {
	publishDraft: (slug, publisher, now) => publishDraftReview(bars, slug, publisher, now),
	invalidatePublicViews: invalidatePublicReviewCaches,
	audit: logAuditEvent,
	now: () => new Date()
};
