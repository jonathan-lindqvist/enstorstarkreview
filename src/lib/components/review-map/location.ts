/** Browser-only location lifetime. Coordinates never leave this closure. */
export const startUserLocationTracking = (
	initializedMap: import('maplibre-gl').Map,
	maplibreApi: typeof import('maplibre-gl'),
	onError: (message: string | null) => void
): (() => void) => {
	let destroyed = false;
	let userLocationWatchId: number | null = null;
	let userLocationMarker: import('maplibre-gl').Marker | null = null;
	let userLocationMarkerAdded = false;
	let userLocationCoordinates: import('maplibre-gl').LngLat | null = null;
	let userLocationAccuracy = 0;
	let userInteractedBeforeFirstLocation = false;
	let firstLocationHandled = false;
	let accuracyCircle: HTMLDivElement | null = null;
	let markUserInteraction: (() => void) | null = null;
	let updateAccuracyCircle: (() => void) | null = null;

	const isValidLocation = (latitude: number, longitude: number): boolean =>
		Number.isFinite(latitude) &&
		latitude >= -90 &&
		latitude <= 90 &&
		Number.isFinite(longitude) &&
		longitude >= -180 &&
		longitude <= 180;
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

	if (!window.navigator.geolocation) {
		onError('Din position kunde inte hämtas just nu.');
	} else {
		try {
			userLocationWatchId = window.navigator.geolocation.watchPosition(
				(position) => {
					if (destroyed || !userLocationMarker) return;
					const { latitude, longitude, accuracy } = position.coords;
					if (!isValidLocation(latitude, longitude)) {
						onError('Din position kunde inte hämtas just nu.');
						return;
					}

					onError(null);
					userLocationCoordinates = new maplibreApi.LngLat(longitude, latitude);
					userLocationAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
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
				},
				(error) => {
					if (destroyed) return;
					onError(
						error.code === 1
							? 'Platsåtkomst nekades. Ändra behörigheten i webbläsaren om du vill visa din position.'
							: 'Din position kunde inte hämtas just nu.'
					);
				},
				{
					enableHighAccuracy: false,
					maximumAge: 15_000,
					timeout: 10_000
				}
			);
		} catch {
			onError('Din position kunde inte hämtas just nu.');
		}
	}

	return () => {
		destroyed = true;
		if (userLocationWatchId !== null) {
			window.navigator.geolocation?.clearWatch(userLocationWatchId);
			userLocationWatchId = null;
		}
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
