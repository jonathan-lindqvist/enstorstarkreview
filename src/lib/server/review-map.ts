import { mapGeocodes } from '$lib/db/map-geocodes';
import { listPublicReviews } from './reviews/queries';
import { createMarkerLoader } from './map/markers';
import { createGeocodeStore } from './map/geocodes';
import { createNominatimClient } from './map/nominatim';
import { createReviewMapService } from './map/service';
import { invalidateRegionalReviewStatisticsCache } from './review-statistics';

// One instance per process preserves shared caches and the single geocoding attempt.
const service = createReviewMapService({
	markers: createMarkerLoader(listPublicReviews, mapGeocodes),
	geocodes: createGeocodeStore(mapGeocodes),
	findCoordinates: createNominatimClient().findCoordinates,
	onGeocodeResolved: invalidateRegionalReviewStatisticsCache
});
export const {
	getPublicReviewMapData,
	invalidatePublicReviewMapCache,
	resolveOnePublicReviewMapMarker
} = service;
