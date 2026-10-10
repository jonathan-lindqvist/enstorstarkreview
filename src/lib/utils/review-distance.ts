import type { Coordinates } from '$lib/types/review-location';

export const isValidCoordinates = (value: unknown): value is Coordinates => {
	if (!value || typeof value !== 'object') return false;
	const { latitude, longitude } = value as Partial<Coordinates>;
	return (
		typeof latitude === 'number' &&
		Number.isFinite(latitude) &&
		latitude >= -90 &&
		latitude <= 90 &&
		typeof longitude === 'number' &&
		Number.isFinite(longitude) &&
		longitude >= -180 &&
		longitude <= 180
	);
};

/** Approximate great-circle distance, calculated entirely in the browser for visitors. */
export const distanceKm = (first: unknown, second: unknown): number | null => {
	if (!isValidCoordinates(first) || !isValidCoordinates(second)) return null;
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const latitudeDelta = radians(second.latitude - first.latitude);
	const longitudeDelta = radians(second.longitude - first.longitude);
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(radians(first.latitude)) *
			Math.cos(radians(second.latitude)) *
			Math.sin(longitudeDelta / 2) ** 2;
	return 2 * 6_371 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, haversine))));
};

export const isValidDistanceKm = (value: number | null | undefined): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0;

const distanceFormatter = new Intl.NumberFormat('sv-SE', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});

export const formatDistanceKm = (value: number | null | undefined): string | null =>
	isValidDistanceKm(value) ? `${distanceFormatter.format(value)} km` : null;
