import { getImage } from './procedures/images';
import { getMap, resolveNextMapMarker } from './procedures/map';
import { getReviewMetadata, listUsers } from './procedures/metadata';
import { getNearbyReviews } from './procedures/nearby-reviews';
import { createReviewRequest } from './procedures/review-requests';
import {
	createReview,
	deleteReview,
	getReview,
	getReviewHistory,
	listReviews,
	publishReview,
	updateReview
} from './procedures/reviews';
import { createSession, deleteCurrentSession, getCurrentSession } from './procedures/sessions';
import { getStatistics } from './procedures/statistics';

/**
 * Every server feature, defined once. The API door serves this router under `/api/v1` and
 * generates `openapi/v1.yaml` from it; web loads and actions call the same procedures through
 * `webClient(event)`. The order here is the path order of the generated document.
 */
export const router = {
	sessions: {
		create: createSession,
		current: getCurrentSession,
		delete: deleteCurrentSession
	},
	metadata: { get: getReviewMetadata },
	users: { list: listUsers },
	reviews: {
		list: listReviews,
		create: createReview,
		get: getReview,
		update: updateReview,
		delete: deleteReview,
		publish: publishReview,
		history: getReviewHistory
	},
	images: { get: getImage },
	nearbyReviews: { get: getNearbyReviews },
	map: {
		get: getMap,
		resolveNextMarker: resolveNextMapMarker
	},
	statistics: { get: getStatistics },
	reviewRequests: { create: createReviewRequest }
};

export type Router = typeof router;
