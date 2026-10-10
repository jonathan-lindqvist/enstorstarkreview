import { watchUserLocation } from '$lib/client/user-location';

/** Browser-only map presentation. Coordinates never leave browser memory. */
export const startUserLocationTracking = (
	initializedMap: import('maplibre-gl').Map,
	maplibreApi: typeof import('maplibre-gl'),
	onError: (message: string | null) => void
): (() => void) => {
	let destroyed = false;
	let userLocationMarker: import('maplibre-gl').Marker | null = null;
	let userLocationMarkerAdded = false;
	let userLocationCoordinates: import('maplibre-gl').LngLat | null = null;
	let userLocationAccuracy = 0;
	let userInteractedBeforeFirstLocation = false;
	let firstLocationHandled = false;
	let accuracyCircle: HTMLDivElement | null = null;
	let markUserInteraction: (() => void) | null = null;
	let updateAccuracyCircle: (() => void) | null = null;

	const locationPositioner = document.createElement('div');
	locationPositioner.className = 'bar-map-user-location-positioner';
	locationPositioner.setAttribute('role', 'img');
	locationPositioner.setAttribute('aria-label', 'Din aktuella position');

	accuracyCircle = document.createElement('div');
	accuracyCircle.className = 'bar-map-user-location-accuracy';
	accuracyCircle.setAttribute('aria-hidden', 'true');
	const locationDot = document.createElement('div');
	locationDot.className = 'bar-map-user-location-dot';
	locationDot.setAttribute('aria-hidden', 'true');
	locationPositioner.append(accuracyCircle, locationDot);
	userLocationMarker = new maplibreApi.Marker({
		element: locationPositioner,
		anchor: 'center'
	});

	updateAccuracyCircle = () => {
		if (!accuracyCircle || !userLocationCoordinates || userLocationAccuracy <= 0) return;
		const screenPosition = initializedMap.project(userLocationCoordinates);
		const locationAtHundredPixels = initializedMap.unproject([
			screenPosition.x + 100,
			screenPosition.y
		]);
		const metersPerPixel = userLocationCoordinates.distanceTo(locationAtHundredPixels) / 100;
		if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return;

		const diameter = Math.min(10_000, (userLocationAccuracy * 2) / metersPerPixel);
		accuracyCircle.style.width = `${diameter.toFixed(2)}px`;
		accuracyCircle.style.height = `${diameter.toFixed(2)}px`;
	};

	markUserInteraction = () => {
		if (!firstLocationHandled) userInteractedBeforeFirstLocation = true;
	};
	initializedMap.getContainer().addEventListener('pointerdown', markUserInteraction);
	initializedMap.getContainer().addEventListener('wheel', markUserInteraction, {
		passive: true
	});
	initializedMap.getContainer().addEventListener('keydown', markUserInteraction);
	initializedMap.on('zoom', updateAccuracyCircle);
	initializedMap.on('move', updateAccuracyCircle);
	initializedMap.on('rotate', updateAccuracyCircle);
	initializedMap.on('pitch', updateAccuracyCircle);

	const stopLocation = watchUserLocation(({ position, error }) => {
		if (destroyed || !userLocationMarker) return;
		onError(error);
		if (!position) return;
		const { latitude, longitude, accuracy } = position;
		userLocationCoordinates = new maplibreApi.LngLat(longitude, latitude);
		userLocationAccuracy = accuracy;
		userLocationMarker.setLngLat(userLocationCoordinates);
		if (!userLocationMarkerAdded) {
			userLocationMarker.addTo(initializedMap);
			userLocationMarkerAdded = true;
		}
		updateAccuracyCircle?.();

		if (!firstLocationHandled) {
			firstLocationHandled = true;
			if (!userInteractedBeforeFirstLocation) {
				initializedMap.easeTo({ center: userLocationCoordinates, duration: 500 });
			}
		}
	});

	return () => {
		destroyed = true;
		stopLocation();
		if (initializedMap && markUserInteraction) {
			initializedMap.getContainer().removeEventListener('pointerdown', markUserInteraction);
			initializedMap.getContainer().removeEventListener('wheel', markUserInteraction);
			initializedMap.getContainer().removeEventListener('keydown', markUserInteraction);
		}
		if (initializedMap && updateAccuracyCircle) {
			initializedMap.off('zoom', updateAccuracyCircle);
			initializedMap.off('move', updateAccuracyCircle);
			initializedMap.off('rotate', updateAccuracyCircle);
			initializedMap.off('pitch', updateAccuracyCircle);
		}
		userLocationMarker?.remove();
	};
};
