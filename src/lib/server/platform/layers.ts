import { Layer } from 'effect';
import { AuditLog } from '$lib/server/audit';
import { Sessions } from '$lib/server/auth';
import { PasswordHasher } from '$lib/server/login/credentials';
import { Geocoder } from '$lib/server/map/nominatim';
import { ReviewMap } from '$lib/server/map/service';
import { LoginRateLimiter } from '$lib/server/rate-limit';
import { ReviewImages } from '$lib/server/review-images';
import { ReviewRequestRateLimiter } from '$lib/server/review-request-rate-limit';
import { ReviewRequestDelivery } from '$lib/server/review-requests/delivery';
import { ReviewStatistics } from '$lib/server/review-statistics';
import { PublicReviewViews } from '$lib/server/reviews/public-cache';
import { ReviewStore } from '$lib/server/reviews/store';
import { UserStore } from '$lib/server/users';
import { AppConfig } from './config';
import { Mongo } from './mongo';

/**
 * Every application service, built on `Mongo` and `AppConfig`. Tests replace `Mongo` and the
 * external services (Discord, Nominatim) with their test layers and reuse the rest.
 */
export const ServicesLayer = Layer.mergeAll(
	AuditLog.layer,
	Sessions.layer,
	PasswordHasher.layer,
	LoginRateLimiter.layer,
	ReviewRequestRateLimiter.layer,
	ReviewImages.layer,
	ReviewStore.layer,
	UserStore.layer,
	PublicReviewViews.layer
).pipe(
	Layer.provideMerge(Layer.mergeAll(ReviewStatistics.layer, ReviewMap.layer)),
	Layer.provideMerge(Layer.mergeAll(Geocoder.layer, ReviewRequestDelivery.layer))
);

export type AppServices = Layer.Success<typeof ServicesLayer>;

/** The production graph: services, MongoDB and configuration from the environment. */
export const makeAppLayer = (env: Record<string, string | undefined>) =>
	ServicesLayer.pipe(
		Layer.provideMerge(Mongo.layer),
		Layer.provideMerge(AppConfig.layerFromEnv(env))
	);
