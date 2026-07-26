import db from '$lib/db/db';
import type { MapGeocode } from '$lib/types/map-geocode';

export const mapGeocodes = db.collection<MapGeocode>('map_geocodes');
