import type { UserLocationState } from '$lib/types/review-location';
import { isValidCoordinates } from '$lib/utils/review-distance';
import { getBrowserPreferences, onPreferencesChange } from '$lib/preferences';

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
	let generation = 0;
	let enabled: boolean | undefined;
	const unavailable = () => onChange({ position: null, error: UNAVAILABLE, disabled: false });
	const stopWatch = () => {
		generation += 1;
		if (watchId !== null) geolocation?.clearWatch(watchId);
		watchId = null;
	};
	const synchronizePreference = () => {
		const nextEnabled = getBrowserPreferences().locationEnabled;
		if (stopped || enabled === nextEnabled) return;
		const restarting = enabled !== undefined;
		enabled = nextEnabled;
		stopWatch();
		if (!enabled) {
			onChange({ position: null, error: null, disabled: true });
			return;
		}
		if (restarting) onChange({ position: null, error: null, disabled: false });
		if (!geolocation) {
			unavailable();
			return;
		}
		const watchGeneration = generation;
		const isCurrent = () => !stopped && generation === watchGeneration;
		try {
			const registeredId = geolocation.watchPosition(
				({ coords }) => {
					if (!isCurrent()) return;
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
						error: null,
						disabled: false
					});
				},
				(error) => {
					if (isCurrent())
						onChange({
							position: null,
							error: error.code === 1 ? DENIED : UNAVAILABLE,
							disabled: false
						});
				},
				{ enableHighAccuracy: false, maximumAge: 15_000, timeout: 10_000 }
			);
			// A synchronous callback can disable location while the watch is being registered.
			if (isCurrent()) watchId = registeredId;
			else geolocation.clearWatch(registeredId);
		} catch {
			if (isCurrent()) unavailable();
		}
	};
	const stopPreferenceListener = onPreferencesChange(synchronizePreference);
	synchronizePreference();

	return () => {
		if (stopped) return;
		stopped = true;
		stopPreferenceListener();
		stopWatch();
	};
};
