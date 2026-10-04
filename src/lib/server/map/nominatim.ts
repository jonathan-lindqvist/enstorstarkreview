import { NOMINATIM_MIN_REQUEST_INTERVAL_MS } from './policy';
import {
	createAddressFallback,
	coordinatesFromNominatimResult,
	coordinatesFromFallbackResult
} from './address';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'EnStorStarkReview/1.0';

interface NominatimDependencies {
	fetchImplementation?: typeof fetch;
	now?: () => number;
	wait?: (milliseconds: number) => Promise<void>;
}
export const createNominatimClient = ({
	fetchImplementation = (...args) => fetch(...args),
	now = () => Date.now(),
	wait = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}: NominatimDependencies = {}) => {
	let lastNominatimRequestAt = 0;
	const waitForNominatimSlot = async (): Promise<void> => {
		const waitTime = Math.max(
			0,
			lastNominatimRequestAt + NOMINATIM_MIN_REQUEST_INTERVAL_MS - now()
		);
		if (waitTime) await wait(waitTime);
		lastNominatimRequestAt = now();
	};

	const searchNominatim = async (
		address: string,
		options: { limit: number; addressDetails: boolean; addressLayerOnly?: boolean }
	): Promise<unknown[]> => {
		await waitForNominatimSlot();

		const url = new URL(NOMINATIM_SEARCH_URL);
		url.searchParams.set('q', address);
		url.searchParams.set('format', 'jsonv2');
		url.searchParams.set('limit', String(options.limit));
		url.searchParams.set('addressdetails', options.addressDetails ? '1' : '0');
		url.searchParams.set('accept-language', 'sv');
		if (options.addressLayerOnly) url.searchParams.set('layer', 'address');

		const response = await fetchImplementation(url, {
			headers: {
				accept: 'application/json',
				'user-agent': NOMINATIM_USER_AGENT
			},
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

		const results: unknown = await response.json();
		if (!Array.isArray(results)) throw new Error('Nominatim returned an invalid response');
		return results;
	};

	const findCoordinates = async (
		address: string
	): Promise<{ latitude: number; longitude: number } | null> => {
		const exactResults = await searchNominatim(address, { limit: 1, addressDetails: false });
		for (const result of exactResults) {
			const coordinates = coordinatesFromNominatimResult(result);
			if (coordinates) return coordinates;
		}
		if (exactResults.length > 0) return null;

		const fallback = createAddressFallback(address);
		if (!fallback) return null;

		const fallbackResults = await searchNominatim(fallback.query, {
			limit: 5,
			addressDetails: true,
			addressLayerOnly: true
		});
		for (const result of fallbackResults) {
			const coordinates = coordinatesFromFallbackResult(result, fallback);
			if (coordinates) return coordinates;
		}

		return null;
	};

	return { findCoordinates };
};
