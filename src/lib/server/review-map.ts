import { bars } from '$lib/db/bars';
import { mapGeocodes } from '$lib/db/map-geocodes';
import { createMarkerLoader } from './map/markers';
import { createGeocodeStore } from './map/geocodes';
import { createNominatimClient } from './map/nominatim';
import { createReviewMapService } from './map/service';

// One instance per process preserves shared caches and the single geocoding attempt.
const service = createReviewMapService({
	markers: createMarkerLoader(bars, mapGeocodes),
	geocodes: createGeocodeStore(mapGeocodes),
	findCoordinates: createNominatimClient().findCoordinates
});
export const {
	getPublicReviewMapData,
	invalidatePublicReviewMapCache,
	resolveOnePublicReviewMapMarker
} = service;
