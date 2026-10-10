import type { MapGeocode } from '$lib/types/map-geocode';
import { stripControlCharacters } from '$lib/utils/review-text';
import { isValidCoordinates } from '$lib/utils/review-distance';

const FALLBACK_STREET_TYPES = new Set([
	'tn',
	'tänav',
	'st',
	'street',
	'rd',
	'road',
	'ave',
	'avenue',
	'blvd',
	'boulevard',
	'ln',
	'lane',
	'dr',
	'drive',
	'str',
	'strasse',
	'straße',
	'iela',
	'gatvė',
	'g',
	'ul',
	'ulica'
]);

interface NominatimAddress {
	house_number?: string;
	road?: string;
	postcode?: string;
	city?: string;
	town?: string;
	village?: string;
	municipality?: string;
	hamlet?: string;
}

interface NominatimResult {
	lat?: string;
	lon?: string;
	address?: NominatimAddress;
}

interface AddressFallback {
	query: string;
	road: string;
	houseNumber: string;
	remainder: string;
	requiresPostcodeMatch: boolean;
}

const isFiniteCoordinate = (value: unknown, min: number, max: number): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export const hasValidCoordinates = (
	value: Pick<MapGeocode, 'latitude' | 'longitude'>
): value is Pick<MapGeocode, 'latitude' | 'longitude'> & {
	latitude: number;
	longitude: number;
} => isValidCoordinates(value);

export const normalizeMapAddress = (address: string): string =>
	stripControlCharacters(address).replace(/\s+/g, ' ').trim().toLocaleLowerCase('sv-SE');

const normalizeAddressPart = (value: string): string =>
	normalizeMapAddress(value)
		.normalize('NFKD')
		.replace(/\p{Mark}/gu, '')
		.replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
		.trim();

const containsAddressPart = (source: string, value: string): boolean =>
	value.length > 0 && ` ${source} `.includes(` ${value} `);

export const createAddressFallback = (address: string): AddressFallback | null => {
	const components = address.split(',').map((component) => component.trim());
	if (components.length < 2 || components.some((component) => component.length === 0)) return null;

	const streetParts = components[0].split(/\s+/);
	if (streetParts.length < 3) return null;

	const houseNumber = streetParts.at(-1)!;
	if (!/^\d[\p{Letter}\p{Number}/-]*$/u.test(houseNumber)) return null;

	const streetType = normalizeAddressPart(streetParts.at(-2)!);
	if (!FALLBACK_STREET_TYPES.has(streetType)) return null;

	const road = streetParts.slice(0, -2).join(' ');
	if (!road) return null;

	const remainderComponents = components.slice(1);
	return {
		query: [`${road} ${houseNumber}`, ...remainderComponents].join(', '),
		road,
		houseNumber,
		remainder: normalizeAddressPart(remainderComponents.join(' ')),
		requiresPostcodeMatch: remainderComponents.some((component) => {
			const firstToken = component.split(/\s+/)[0] ?? '';
			return /\d/u.test(firstToken);
		})
	};
};

export const coordinatesFromNominatimResult = (
	result: unknown
): { latitude: number; longitude: number } | null => {
	if (!result || typeof result !== 'object') return null;
	const candidate = result as NominatimResult;
	const latitude = Number(candidate.lat);
	const longitude = Number(candidate.lon);
	if (!isFiniteCoordinate(latitude, -90, 90) || !isFiniteCoordinate(longitude, -180, 180)) {
		return null;
	}
	return { latitude, longitude };
};

export const coordinatesFromFallbackResult = (
	result: unknown,
	fallback: AddressFallback
): { latitude: number; longitude: number } | null => {
	const coordinates = coordinatesFromNominatimResult(result);
	if (!coordinates) return null;

	const candidate = result as NominatimResult;
	const details = candidate.address;
	if (!details || typeof details.road !== 'string' || typeof details.house_number !== 'string') {
		return null;
	}

	if (normalizeAddressPart(details.road) !== normalizeAddressPart(fallback.road)) return null;
	if (normalizeAddressPart(details.house_number) !== normalizeAddressPart(fallback.houseNumber)) {
		return null;
	}

	const localityMatches = [
		details.city,
		details.town,
		details.village,
		details.municipality,
		details.hamlet
	].some(
		(value) =>
			typeof value === 'string' &&
			containsAddressPart(fallback.remainder, normalizeAddressPart(value))
	);
	if (!localityMatches) return null;

	if (
		fallback.requiresPostcodeMatch &&
		(typeof details.postcode !== 'string' ||
			!containsAddressPart(fallback.remainder, normalizeAddressPart(details.postcode)))
	) {
		return null;
	}

	return coordinates;
};
