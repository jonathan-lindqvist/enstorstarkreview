<script lang="ts">
	import { onMount } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
	import type { PublicReviewMapMarker } from '$lib/server/review-map';

	interface Props {
		markers: PublicReviewMapMarker[];
		onReady?: () => void;
	}

	let { markers, onReady }: Props = $props();
	let container = $state<HTMLDivElement>();
	let selectedMarker = $state<PublicReviewMapMarker | null>(null);
	let mapUnavailable = $state(false);
	let map: import('maplibre-gl').Map | null = null;
	let maplibre: typeof import('maplibre-gl') | null = null;
	let markerInstances = new Map<
		string,
		{ marker: import('maplibre-gl').Marker; element: HTMLButtonElement }
	>();
	let lastMarkerSignature = '';
	let selectedElement: HTMLButtonElement | null = null;

	const markerKey = (marker: PublicReviewMapMarker): string => marker.slug;
	const markerSignature = (items: PublicReviewMapMarker[]): string =>
		items
			.map((marker) => `${marker.slug}:${marker.latitude}:${marker.longitude}`)
			.sort()
			.join('|');

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
			instance.element.classList.toggle('is-selected', selectedMarker?.slug === key);
		}
	};

	const showMarker = (marker: PublicReviewMapMarker, element: HTMLButtonElement) => {
		selectedMarker = marker;
		selectedElement = element;
		updateSelectedMarkerStyle();
	};

	const closePreview = () => {
		selectedMarker = null;
		updateSelectedMarkerStyle();
		selectedElement?.focus();
	};

	const fitMapToMarkers = () => {
		if (!map || !maplibre) return;
		if (!markers.length) {
			map.jumpTo({ center: [15, 62], zoom: 4.25 });
			return;
		}

		if (markers.length === 1) {
			map.jumpTo({ center: [markers[0].longitude, markers[0].latitude], zoom: 14.5 });
			return;
		}

		const bounds = new maplibre.LngLatBounds();
		for (const marker of markers) bounds.extend([marker.longitude, marker.latitude]);
		map.fitBounds(bounds, { padding: 56, maxZoom: 14.5, duration: 0 });
	};

	const syncMarkers = () => {
		if (!map || !maplibre) return;

		const nextKeys = new Set(markers.map(markerKey));
		for (const [key, instance] of markerInstances) {
			if (!nextKeys.has(key)) {
				instance.marker.remove();
				markerInstances.delete(key);
			}
		}

		const offsets = markerOffsets(markers);
		for (const marker of markers) {
			if (markerInstances.has(markerKey(marker))) continue;

			const element = document.createElement('button');
			element.type = 'button';
			element.className = 'bar-map-marker';
			element.setAttribute('aria-label', `Visa ${marker.title} på kartan`);
			element.title = marker.title;
			element.addEventListener('click', () => showMarker(marker, element));

			const instance = new maplibre.Marker({
				element,
				offset: offsets.get(markerKey(marker)) ?? [0, 0]
			})
				.setLngLat([marker.longitude, marker.latitude])
				.addTo(map);
			markerInstances.set(markerKey(marker), { marker: instance, element });
		}

		updateSelectedMarkerStyle();
		const nextSignature = markerSignature(markers);
		if (nextSignature !== lastMarkerSignature) {
			lastMarkerSignature = nextSignature;
			fitMapToMarkers();
		}
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && selectedMarker) {
			event.preventDefault();
			closePreview();
		}
	};

	$effect(() => {
		syncMarkers();
	});

	onMount(() => {
		let destroyed = false;

		const initialize = async () => {
			try {
				maplibre = await import('maplibre-gl');
				maplibre.setWorkerUrl(maplibreWorkerUrl);
				if (destroyed || !container || !maplibre) return;

				map = new maplibre.Map({
					container,
					style: 'https://tiles.openfreemap.org/styles/liberty',
					center: [15, 62],
					zoom: 4.25
				});
				map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
				syncMarkers();
				map.once('load', () => {
					syncMarkers();
					onReady?.();
				});
				map.once('error', () => {
					mapUnavailable = true;
				});
			} catch (error) {
				console.error('Kartan kunde inte laddas:', error);
				mapUnavailable = true;
			}
		};

		void initialize();

		return () => {
			destroyed = true;
			for (const instance of markerInstances.values()) instance.marker.remove();
			markerInstances.clear();
			map?.remove();
			map = null;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="relative overflow-hidden rounded-[1.65rem] border border-white/90 bg-slate-100 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.55)]"
>
	<div
		bind:this={container}
		class="h-[min(66svh,38rem)] min-h-[24rem] w-full"
		aria-label="Karta över recenserade barer"
	></div>

	{#if mapUnavailable}
		<div
			class="absolute inset-x-4 top-4 rounded-2xl border border-amber-300/80 bg-amber-50/95 p-4 text-sm text-amber-950 shadow-sm"
			role="status"
		>
			Kartan kunde inte laddas just nu. Försök igen om en liten stund.
		</div>
	{/if}

	{#if selectedMarker}
		<section
			class="absolute inset-x-3 bottom-3 rounded-2xl border border-white/90 bg-white/94 p-4 shadow-[0_18px_42px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:bottom-5 sm:left-5 sm:right-auto sm:w-80"
			aria-label={`Information om ${selectedMarker.title}`}
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
						Recension
					</p>
					<h2 class="mt-1 text-xl font-semibold text-slate-900">{selectedMarker.title}</h2>
				</div>
				<button
					type="button"
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white bg-slate-100 text-lg text-slate-600 transition hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
					onclick={closePreview}
					aria-label="Stäng förhandsvisning"
				>
					×
				</button>
			</div>
			<p class="mt-2 text-sm text-slate-600">{selectedMarker.location}</p>
			<p class="mt-3 text-sm font-semibold text-slate-800">
				Helhetsbetyg: {selectedMarker.rating}/3
			</p>
			<a
				href={`/${encodeURIComponent(selectedMarker.slug)}`}
				class="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-4 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
			>
				Läs recension
			</a>
		</section>
	{/if}
</div>

<style>
	:global(.bar-map-marker) {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		cursor: pointer;
		border: 3px solid rgb(255 255 255 / 0.96);
		border-radius: 9999px;
		background: var(--color-ember);
		box-shadow: 0 5px 14px rgb(15 23 42 / 0.32);
		transition:
			transform 150ms ease,
			background-color 150ms ease;
	}

	:global(.bar-map-marker::after) {
		width: 0.42rem;
		height: 0.42rem;
		content: '';
		border-radius: 9999px;
		background: white;
	}

	:global(.bar-map-marker:hover),
	:global(.bar-map-marker.is-selected) {
		transform: scale(1.14);
		background: var(--color-primary-gray);
	}

	:global(.bar-map-marker:focus-visible) {
		outline: 3px solid rgb(56 189 248);
		outline-offset: 3px;
	}

	:global(.maplibregl-ctrl-group) {
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 0.9);
		border-radius: 1rem;
		box-shadow: 0 8px 22px rgb(15 23 42 / 0.18);
	}

	:global(.maplibregl-ctrl-group button) {
		width: 2.4rem;
		height: 2.4rem;
	}

	:global(.maplibregl-ctrl-attrib) {
		border-radius: 0.5rem 0 0 0;
		background: rgb(255 255 255 / 0.83);
	}
</style>
