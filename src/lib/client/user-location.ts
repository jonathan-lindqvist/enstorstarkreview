import type { UserLocationState } from '$lib/types/review-location';
import { isValidCoordinates } from '$lib/utils/review-distance';

const UNAVAILABLE = 'Din position kunde inte hämtas just nu.';
const DENIED =
	'Platsåtkomst nekades. Ändra behörigheten i webbläsaren om du vill visa din position.';

/** Call on mount and dispose on teardown. No coordinates are persisted or transmitted. */
export const watchUserLocation = (
	onChange: (state: UserLocationState) => void,
	geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'> | undefined = globalThis.navigator
		?.geolocation
): (() => void) => {
	let stopped = false;
	let watchId: number | null = null;
	const unavailable = () => onChange({ position: null, error: UNAVAILABLE });
	if (!geolocation) {
		unavailable();
	} else {
		try {
			watchId = geolocation.watchPosition(
				({ coords }) => {
					if (stopped) return;
					if (!isValidCoordinates(coords)) {
						unavailable();
						return;
					}
					onChange({
						position: {
							latitude: coords.latitude,
							longitude: coords.longitude,
							accuracy:
								Number.isFinite(coords.accuracy) && coords.accuracy > 0 ? coords.accuracy : 0
						},
						error: null
					});
				},
				(error) => {
					if (!stopped)
						onChange({ position: null, error: error.code === 1 ? DENIED : UNAVAILABLE });
				},
				{ enableHighAccuracy: false, maximumAge: 15_000, timeout: 10_000 }
			);
		} catch {
			unavailable();
		}
	}

	return () => {
		if (stopped) return;
		stopped = true;
		if (watchId !== null) geolocation?.clearWatch(watchId);
	};
};
