import db from '#lib/db/db.js';
import type { MapGeocode } from '#lib/types/map-geocode.js';

export const mapGeocodes = db.collection<MapGeocode>('map_geocodes');
