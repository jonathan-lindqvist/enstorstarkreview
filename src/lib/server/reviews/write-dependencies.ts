import type { ObjectId } from 'mongodb';
import type { BarReview, BarReviewUpdate, ReviewChangeLogEntry } from '$lib/types/bar-review';
import type { AuditEventInput } from '$lib/server/audit';
import type {
	ReviewImageUploadOptions,
	ReviewImageUploadPipelineResult,
	ReviewImageUploadResult
} from '$lib/server/review-images';

export interface ReviewEditorContext {
	username: string;
	ip: string;
}
export interface ReviewWriteDependencies {
	loadValidUsernames(authors: string[]): Promise<string[]>;
	findSlugConflict(slug: string, excludeId?: ObjectId): Promise<BarReview | null>;
	uploadImage(
		image: FormDataEntryValue | null,
		options: ReviewImageUploadOptions
	): Promise<ReviewImageUploadPipelineResult>;
	cleanupImage(upload: ReviewImageUploadResult | null): void;
	audit(event: AuditEventInput): Promise<void>;
	now(): Date;
}
export interface CreateReviewDependencies extends ReviewWriteDependencies {
	insertReview(review: BarReview): Promise<unknown>;
}
export interface EditReviewDependencies extends ReviewWriteDependencies {
	findReview(id: ObjectId): Promise<BarReview | null>;
	updateReview(
		id: ObjectId,
		update: BarReviewUpdate & { changeLog: ReviewChangeLogEntry[] }
	): Promise<unknown>;
	invalidatePublicViews(): void;
}
