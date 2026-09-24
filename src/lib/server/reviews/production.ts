import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { logAuditEvent } from '$lib/server/audit';
import { uploadReviewImage, cleanupReviewImageUpload } from '$lib/server/review-images';
import type { ReviewWriteDependencies } from './write-dependencies';

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
