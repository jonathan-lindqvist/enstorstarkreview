import type { PublicReviewMapMarker } from '$lib/types/review-map';
import { getBeerPriceDisplay } from '$lib/utils/price';

const updateMarkerContent = (
	element: HTMLButtonElement,
	positioner: HTMLDivElement,
	marker: PublicReviewMapMarker
) => {
	const priceDisplay = getBeerPriceDisplay(marker.beerPriceKr, marker.isHappyHourPrice);
	element.setAttribute('aria-label', `Visa ${marker.title} på kartan`);
	element.title = priceDisplay
		? `${marker.title} – Pris för en stor stark: ${priceDisplay.text}${priceDisplay.note ? ` (${priceDisplay.note})` : ''}`
		: marker.title;

	let priceLabel = positioner.querySelector<HTMLSpanElement>('.bar-map-marker-price');
	let priceDescription = positioner.querySelector<HTMLSpanElement>('.bar-map-marker-description');
	if (!priceDisplay) {
		priceLabel?.remove();
		priceDescription?.remove();
		element.removeAttribute('aria-describedby');
		return;
	}

	if (!priceLabel) {
		priceLabel = document.createElement('span');
		priceLabel.className = 'bar-map-marker-price';
		priceLabel.setAttribute('aria-hidden', 'true');
		positioner.append(priceLabel);
	}
	if (!priceDescription) {
		priceDescription = document.createElement('span');
		priceDescription.id = `bar-map-marker-price-${marker.slug}`;
		priceDescription.className = 'bar-map-marker-description';
		positioner.append(priceDescription);
	}

	priceLabel.textContent = priceDisplay.text;
	priceLabel.title = priceDisplay.note
		? `Pris för en stor stark: ${priceDisplay.text} (${priceDisplay.note})`
		: `Pris för en stor stark: ${priceDisplay.text}`;
	priceDescription.textContent = priceDisplay.note
		? `Pris för en stor stark: ${priceDisplay.text}. Happy hour-pris.`
		: `Pris för en stor stark: ${priceDisplay.text}.`;
	element.setAttribute('aria-describedby', priceDescription.id);
};

export const createReviewMarkers = (
	map: import('maplibre-gl').Map,
	maplibre: typeof import('maplibre-gl'),
	onSelect: (marker: PublicReviewMapMarker, element: HTMLButtonElement) => void
) => {
	let selectedSlug: string | null = null;
	const markerInstances = new Map<
		string,
		{
			marker: import('maplibre-gl').Marker;
			element: HTMLButtonElement;
			positioner: HTMLDivElement;
			data: PublicReviewMapMarker;
			offset: [number, number];
		}
	>();
	const markerKey = (marker: PublicReviewMapMarker): string => marker.slug;

	const markerOffsets = (items: PublicReviewMapMarker[]): Map<string, [number, number]> => {
		const groups = new Map<string, PublicReviewMapMarker[]>();
		for (const marker of items) {
			const coordinateKey = `${marker.latitude}:${marker.longitude}`;
			groups.set(coordinateKey, [...(groups.get(coordinateKey) ?? []), marker]);
		}

		const offsets = new Map<string, [number, number]>();
		for (const group of groups.values()) {
			group.forEach((marker, index) => {
				if (group.length === 1) {
					offsets.set(markerKey(marker), [0, 0]);
					return;
				}

				const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
				offsets.set(markerKey(marker), [Math.cos(angle) * 13, Math.sin(angle) * 13]);
			});
		}

		return offsets;
	};

	const updateSelectedMarkerStyle = () => {
		for (const [key, instance] of markerInstances) {
			const isSelected = selectedSlug === key;
			instance.element.classList.toggle('is-selected', isSelected);
			instance.element.setAttribute('aria-pressed', String(isSelected));
			instance.positioner.classList.toggle('is-selected', isSelected);
		}
	};

	const sync = (markers: PublicReviewMapMarker[]) => {
		const nextKeys = new Set(markers.map(markerKey));
		for (const [key, instance] of markerInstances) {
			if (!nextKeys.has(key)) {
				instance.marker.remove();
				markerInstances.delete(key);
			}
		}

		const offsets = markerOffsets(markers);
		for (const marker of markers) {
			const existing = markerInstances.get(markerKey(marker));
			const offset: [number, number] = offsets.get(markerKey(marker)) ?? [0, 0];
			if (existing) {
				if (
					existing.data.longitude !== marker.longitude ||
					existing.data.latitude !== marker.latitude
				) {
					existing.marker.setLngLat([marker.longitude, marker.latitude]);
				}
				if (existing.offset[0] !== offset[0] || existing.offset[1] !== offset[1]) {
					existing.marker.setOffset(offset);
					existing.offset = offset;
				}
				if (
					existing.data.title !== marker.title ||
					existing.data.beerPriceKr !== marker.beerPriceKr ||
					existing.data.isHappyHourPrice !== marker.isHappyHourPrice
				) {
					updateMarkerContent(existing.element, existing.positioner, marker);
				}
				existing.data = marker;
				continue;
			}
			const positioner = document.createElement('div');
			positioner.className = 'bar-map-marker-positioner';

			const element = document.createElement('button');
			element.type = 'button';
			element.className = 'bar-map-marker';
			element.setAttribute('aria-pressed', 'false');
			element.addEventListener('click', () => {
				const current = markerInstances.get(markerKey(marker));
				if (current) onSelect(current.data, element);
			});
			positioner.append(element);

			updateMarkerContent(element, positioner, marker);

			const instance = new maplibre.Marker({
				element: positioner,
				offset
			})
				.setLngLat([marker.longitude, marker.latitude])
				.addTo(map);
			markerInstances.set(markerKey(marker), {
				marker: instance,
				element,
				positioner,
				data: marker,
				offset
			});
		}

		updateSelectedMarkerStyle();
	};

	return {
		sync,
		select(slug: string | null) {
			selectedSlug = slug;
			updateSelectedMarkerStyle();
		},
		destroy() {
			for (const instance of markerInstances.values()) instance.marker.remove();
			markerInstances.clear();
		}
	};
};
