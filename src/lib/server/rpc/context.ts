import type { Filter } from 'mongodb';
import type { Session } from 'lucia';
import type { AuditEventInput } from '$lib/server/audit';
import type { LoginDependencies } from '$lib/server/login/login';
import type { ReviewImageReadDependencies } from '$lib/server/review-image-response';
import type { ReviewRequestDependencies } from '$lib/server/review-requests/submit';
import type { DeleteReviewDependencies } from '$lib/server/reviews/delete';
import type { PublishReviewDependencies } from '$lib/server/reviews/publish';
import type {
	CreateReviewDependencies,
	EditReviewDependencies
} from '$lib/server/reviews/write-dependencies';
import type { BarReview } from '$lib/types/bar-review';
import type { NearbyReviewComparison } from '$lib/types/nearby-reviews';
import type { PublicReviewMapData } from '$lib/types/review-map';
import type { PublicReviewStatistics } from '$lib/types/review-statistics';
import type { ObjectId } from 'mongodb';

/**
 * Everything procedures need from the outside world. These are the workflows' existing narrow
 * dependency objects plus a few reads; `production.ts` composes the real ones once, and tests
 * pass fakes in the context instead of mocking modules.
 */
export interface RpcDependencies {
	audit(event: AuditEventInput): Promise<void>;
	reviews: {
		find(filter: Filter<BarReview>): Promise<BarReview[]>;
		findOne(filter: Filter<BarReview>): Promise<BarReview | null>;
		create: CreateReviewDependencies;
		edit: EditReviewDependencies;
		publish: PublishReviewDependencies;
		delete: DeleteReviewDependencies;
		loadNearbyComparison(excludeId?: ObjectId): Promise<NearbyReviewComparison>;
	};
	images: ReviewImageReadDependencies;
	login: LoginDependencies<Session>;
	sessions: { invalidate(sessionId: string): Promise<void> };
	users: { listUsernames(): Promise<string[]> };
	map: {
		getData(): Promise<PublicReviewMapData>;
		resolveOneMarker(): Promise<unknown>;
	};
	statistics: { get(): Promise<PublicReviewStatistics> };
	reviewRequests: ReviewRequestDependencies;
}

/**
 * The request context of every procedure call. Hooks have already authenticated the request:
 * the API door accepts only a bearer token and the web door only the session cookie.
 */
export interface RpcContext {
	user: App.AuthUser | null;
	session: Session | null;
	ip: string;
	/** Which door the call came through. Audit reasons and some messages differ per door. */
	channel: 'web' | 'api';
	deps: RpcDependencies;
	/** Response headers of an API call. The web door has no HTTP response to decorate. */
	resHeaders?: Headers;
}
