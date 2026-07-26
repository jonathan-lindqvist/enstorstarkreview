import { bars } from '$lib/db/bars';
import { mapGeocodes } from '$lib/db/map-geocodes';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';
import type { MapGeocode } from '$lib/types/map-geocode';

export const REVIEW_MAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const NOMINATIM_MIN_REQUEST_INTERVAL_MS = 1_000;
export const MAP_GEOCODE_RETRY_MS = 60 * 60 * 1000;
export const MAP_GEOCODE_NOT_FOUND_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
export const MAP_GEOCODE_LOCK_MS = 2 * 60 * 1000;

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'EnStorStarkReview/1.0';

interface MapReview {
	title: string;
	slug: string;
	rating: number;
	location: string;
}

export interface PublicReviewMapMarker extends MapReview {
	latitude: number;
	longitude: number;
}

export interface PublicReviewMapData {
	markers: PublicReviewMapMarker[];
	totalReviews: number;
}

interface NominatimResult {
	lat?: string;
	lon?: string;
}

let cachedMapData: { value: PublicReviewMapData; expiresAt: number } | null = null;
let cacheVersion = 0;
let pendingMapData: { version: number; promise: Promise<PublicReviewMapData> } | null = null;
let pendingGeocode: Promise<PublicReviewMapMarker | null> | null = null;
let lastNominatimRequestAt = 0;

const isFiniteCoordinate = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const hasValidCoordinates = (
	value: Pick<MapGeocode, 'latitude' | 'longitude'>
): value is Pick<MapGeocode, 'latitude' | 'longitude'> & {
	latitude: number;
	longitude: number;
} => isFiniteCoordinate(value.latitude, -90, 90) && isFiniteCoordinate(value.longitude, -180, 180);

const isDisallowedControlCharacter = (value: string): boolean => {
	const code = value.charCodeAt(0);
	return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
};

export const normalizeMapAddress = (address: string): string =>
	Array.from(address)
		.filter((character) => !isDisallowedControlCharacter(character))
		.join('')
		.replace(/\s+/g, ' ')
		.trim()
		.toLocaleLowerCase('sv-SE');

const isMapReview = (value: unknown): value is MapReview => {
	if (!value || typeof value !== 'object') return false;
	const review = value as Partial<MapReview>;
	return (
		typeof review.title === 'string' &&
		typeof review.slug === 'string' &&
		typeof review.location === 'string' &&
		typeof review.rating === 'number' &&
		Number.isFinite(review.rating)
	);
};

const loadPublicMapReviews = async (): Promise<MapReview[]> => {
	const reviews = await bars
		.find(PUBLIC_REVIEW_FILTER, {
			projection: { _id: 0, title: 1, slug: 1, rating: 1, location: 1 },
			sort: { updatedAt: -1, _id: 1 }
		})
		.toArray();

	return reviews
		.filter(isMapReview)
		.filter((review) => normalizeMapAddress(review.location).length > 0);
};

const loadPublicReviewMapData = async (): Promise<PublicReviewMapData> => {
	const reviews = await loadPublicMapReviews();
	const addressKeys = [...new Set(reviews.map((review) => normalizeMapAddress(review.location)))];
	const geocodes = addressKeys.length
		? await mapGeocodes.find({ addressKey: { $in: addressKeys }, status: 'resolved' }).toArray()
		: [];
	const geocodesByAddress = new Map(geocodes.map((geocode) => [geocode.addressKey, geocode]));

	const markers = reviews.flatMap((review) => {
		const geocode = geocodesByAddress.get(normalizeMapAddress(review.location));
		if (!geocode || !hasValidCoordinates(geocode)) return [];

		return [{ ...review, latitude: geocode.latitude, longitude: geocode.longitude }];
	});

	return { markers, totalReviews: reviews.length };
};

export const invalidatePublicReviewMapCache = (): void => {
	cachedMapData = null;
	cacheVersion += 1;
	pendingMapData = null;
};

export const getPublicReviewMapData = async (): Promise<PublicReviewMapData> => {
	const now = Date.now();
	if (cachedMapData && cachedMapData.expiresAt > now) return cachedMapData.value;

	if (!pendingMapData) {
		const version = cacheVersion;
		const promise = loadPublicReviewMapData()
			.then((value) => {
				if (cacheVersion === version) {
					cachedMapData = {
						value,
						expiresAt: Date.now() + REVIEW_MAP_CACHE_TTL_MS
					};
				}
				return value;
			})
			.finally(() => {
				if (pendingMapData?.promise === promise) pendingMapData = null;
			});
		pendingMapData = { version, promise };
	}

	return pendingMapData.promise;
};

const wait = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitForNominatimSlot = async (): Promise<void> => {
	const waitTime = Math.max(
		0,
		lastNominatimRequestAt + NOMINATIM_MIN_REQUEST_INTERVAL_MS - Date.now()
	);
	if (waitTime) await wait(waitTime);
	lastNominatimRequestAt = Date.now();
};

const findCoordinates = async (
	address: string
): Promise<{ latitude: number; longitude: number } | null> => {
	await waitForNominatimSlot();

	const url = new URL(NOMINATIM_SEARCH_URL);
	url.searchParams.set('q', address);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '1');
	url.searchParams.set('addressdetails', '0');
	url.searchParams.set('accept-language', 'sv');

	const response = await fetch(url, {
		headers: {
			accept: 'application/json',
			'user-agent': NOMINATIM_USER_AGENT
		},
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

	const results: unknown = await response.json();
	if (!Array.isArray(results)) throw new Error('Nominatim returned an invalid response');

	for (const result of results as NominatimResult[]) {
		const latitude = Number(result.lat);
		const longitude = Number(result.lon);
		if (isFiniteCoordinate(latitude, -90, 90) && isFiniteCoordinate(longitude, -180, 180)) {
			return { latitude, longitude };
		}
	}

	return null;
};

const claimGeocode = async (address: string, addressKey: string): Promise<boolean> => {
	const now = new Date();
	const lockUntil = new Date(now.getTime() + MAP_GEOCODE_LOCK_MS);
	const existing = await mapGeocodes.findOne({ addressKey });

	if (existing?.status === 'resolved') return false;
	if (existing?.retryAt && existing.retryAt > now) return false;

	if (!existing) {
		try {
			await mapGeocodes.insertOne({
				addressKey,
				address,
				status: 'pending',
				retryAt: lockUntil,
				updatedAt: now
			});
			return true;
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes('duplicate key')) throw error;
			return false;
		}
	}

	const result = await mapGeocodes.updateOne(
		{
			addressKey,
			status: { $ne: 'resolved' },
			$or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }]
		},
		{ $set: { address, status: 'pending', retryAt: lockUntil, updatedAt: now } }
	);
	return result.modifiedCount === 1;
};

const saveResolvedGeocode = async (
	addressKey: string,
	coordinates: { latitude: number; longitude: number }
): Promise<void> => {
	await mapGeocodes.updateOne(
		{ addressKey },
		{
			$set: {
				status: 'resolved',
				latitude: coordinates.latitude,
				longitude: coordinates.longitude,
				updatedAt: new Date()
			},
			$unset: { retryAt: '' }
		}
	);
};

const saveUnresolvedGeocode = async (
	addressKey: string,
	status: 'not_found' | 'failed'
): Promise<void> => {
	const retryMs = status === 'not_found' ? MAP_GEOCODE_NOT_FOUND_RETRY_MS : MAP_GEOCODE_RETRY_MS;
	await mapGeocodes.updateOne(
		{ addressKey },
		{
			$set: {
				status,
				retryAt: new Date(Date.now() + retryMs),
				updatedAt: new Date()
			},
			$unset: { latitude: '', longitude: '' }
		}
	);
};

const resolveNextPublicReviewMapMarker = async (): Promise<PublicReviewMapMarker | null> => {
	const reviews = await loadPublicMapReviews();
	const seenAddresses = new Set<string>();

	for (const review of reviews) {
		const addressKey = normalizeMapAddress(review.location);
		if (seenAddresses.has(addressKey)) continue;
		seenAddresses.add(addressKey);

		if (!(await claimGeocode(review.location, addressKey))) continue;

		try {
			const coordinates = await findCoordinates(review.location);
			if (!coordinates) {
				await saveUnresolvedGeocode(addressKey, 'not_found');
				return null;
			}

			await saveResolvedGeocode(addressKey, coordinates);
			invalidatePublicReviewMapCache();
			return { ...review, ...coordinates };
		} catch (error) {
			console.error('Map geocoding failed:', error);
			await saveUnresolvedGeocode(addressKey, 'failed');
			return null;
		}
	}

	return null;
};

export const resolveOnePublicReviewMapMarker = async (): Promise<PublicReviewMapMarker | null> => {
	if (pendingGeocode) return null;

	const promise = resolveNextPublicReviewMapMarker().finally(() => {
		if (pendingGeocode === promise) pendingGeocode = null;
	});
	pendingGeocode = promise;
	return promise;
};
