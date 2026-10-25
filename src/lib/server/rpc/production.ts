import { readFile } from 'fs/promises';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { logAuditEvent } from '$lib/server/audit';
import { lucia } from '$lib/server/auth';
import { loginDependencies } from '$lib/server/login/production';
import { readReviewImagePreview } from '$lib/server/review-image-previews';
import { getPublicReviewMapData, resolveOnePublicReviewMapMarker } from '$lib/server/review-map';
import { reviewRequestDependencies } from '$lib/server/review-requests/production';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import {
	createReviewDependencies,
	deleteReviewDependencies,
	editReviewDependencies,
	publishReviewDependencies
} from '$lib/server/reviews/production';
import type { RpcDependencies } from './context';

/**
 * The production dependencies of every procedure, composed once per process from the existing
 * production wiring. Hooks put them on `event.locals.deps`, so both doors share the same
 * MongoDB client, process caches and single geocoding slot.
 */
export const productionDependencies: RpcDependencies = {
	audit: logAuditEvent,
	reviews: {
		find: (filter) => bars.find(filter).toArray(),
		findOne: (filter) => bars.findOne(filter),
		create: createReviewDependencies,
		edit: editReviewDependencies,
		publish: publishReviewDependencies,
		delete: deleteReviewDependencies,
		loadNearbyComparison: loadNearbyReviewComparison
	},
	images: {
		findReview: (filter) => bars.findOne(filter, { projection: { publicationStatus: 1, _id: 0 } }),
		readImage: async (path) => new Uint8Array(await readFile(path)),
		readPreview: readReviewImagePreview
	},
	login: loginDependencies,
	sessions: { invalidate: (sessionId) => lucia.invalidateSession(sessionId) },
	users: {
		listUsernames: async () =>
			(await users.find({}, { projection: { username: 1 } }).toArray()).map((user) => user.username)
	},
	map: {
		getData: getPublicReviewMapData,
		resolveOneMarker: resolveOnePublicReviewMapMarker
	},
	statistics: { get: getPublicReviewStatistics },
	reviewRequests: reviewRequestDependencies
};
