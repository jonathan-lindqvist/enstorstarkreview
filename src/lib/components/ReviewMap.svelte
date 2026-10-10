<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import type { PublicReviewMapMarker } from '$lib/types/review-map';
	import { createReviewMarkers } from './review-map/markers';
	import { startUserLocationTracking } from './review-map/location';
	import BarAttributePills from './BarAttributePills.svelte';
	import X from '@lucide/svelte/icons/x';
	import { isDarkThemeActive, onThemeChange } from '$lib/theme';

	interface Props {
		markers: PublicReviewMapMarker[];
		onReady?: () => void;
	}
	let { markers, onReady }: Props = $props();
	let container = $state<HTMLDivElement>();
	// Marker data is replaced as a whole; retain its identity when synchronizing the preview.
	let selectedMarker = $state.raw<PublicReviewMapMarker | null>(null);
	let mapUnavailable = $state(false);
	let userLocationError = $state<string | null>(null);
	let markerController: ReturnType<typeof createReviewMarkers> | null = null;
	let selectedElement: HTMLButtonElement | null = null;
	const GOTHENBURG_CENTER: [number, number] = [11.9746, 57.7089];
	const GOTHENBURG_START_ZOOM = 12.5;
	const mapStyleUrl = () =>
		`https://tiles.openfreemap.org/styles/${isDarkThemeActive() ? 'dark' : 'liberty'}`;

	const showMarker = (marker: PublicReviewMapMarker, element: HTMLButtonElement) => {
		selectedMarker = marker;
		selectedElement = element;
		markerController?.select(marker.slug);
	};
	const closePreview = () => {
		selectedMarker = null;
		markerController?.select(null);
		selectedElement?.focus();
	};
	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && selectedMarker) {
			event.preventDefault();
			closePreview();
		}
	};
	$effect(() => {
		const items = markers;
		markerController?.sync(items);
		untrack(() => {
			if (selectedMarker) {
				const next = items.find((marker) => marker.slug === selectedMarker?.slug) ?? null;
				if (next !== selectedMarker) selectedMarker = next;
				if (!next) {
					markerController?.select(null);
					selectedElement = null;
				}
			}
		});
	});
	onMount(() => {
		let destroyed = false;
		let map: import('maplibre-gl').Map | null = null;
		let stopLocation: (() => void) | null = null;
		let stopThemeListener: (() => void) | null = null;
		const initialize = async () => {
			try {
				const maplibre = await import('maplibre-gl');
				maplibre.setWorkerUrl(maplibreWorkerUrl);
				if (destroyed || !container) return;
				const initializedMap = new maplibre.Map({
					container,
					style: mapStyleUrl(),
					center: GOTHENBURG_CENTER,
					zoom: GOTHENBURG_START_ZOOM
				});
				map = initializedMap;
				// Review and location markers are DOM markers, so swapping the style keeps them.
				let currentStyleUrl = mapStyleUrl();
				stopThemeListener = onThemeChange(() => {
					const nextStyleUrl = mapStyleUrl();
					if (nextStyleUrl === currentStyleUrl) return;
					currentStyleUrl = nextStyleUrl;
					initializedMap.setStyle(nextStyleUrl);
				});
				initializedMap.addControl(
					new maplibre.NavigationControl({ showCompass: false }),
					'top-right'
				);
				markerController = createReviewMarkers(initializedMap, maplibre, showMarker);
				stopLocation = startUserLocationTracking(initializedMap, maplibre, (message) => {
					userLocationError = message;
				});
				markerController.sync(markers);
				initializedMap.once('load', () => {
					markerController?.sync(markers);
					onReady?.();
				});
				initializedMap.once('error', () => {
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
			stopLocation?.();
			stopThemeListener?.();
			markerController?.destroy();
			markerController = null;
			map?.remove();
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative overflow-hidden rounded-3xl border border-white/90 bg-slate-100">
	<div
		bind:this={container}
		class="h-[min(66svh,38rem)] min-h-[24rem] w-full"
		aria-label="Karta över recenserade barer"
	></div>

	{#if mapUnavailable || userLocationError}
		<div class="pointer-events-none absolute inset-x-4 top-4 space-y-2">
			{#if mapUnavailable}
				<div
					class="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
					role="status"
				>
					Kartan kunde inte laddas just nu. Försök igen om en liten stund.
				</div>
			{/if}
			{#if userLocationError}
				<div
					class="bar-map-user-location-error rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
					role="status"
				>
					{userLocationError}
				</div>
			{/if}
		</div>
	{/if}

	{#if selectedMarker}
		<section
			class="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-white p-4 shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--color-glass-shadow)_70%,transparent)] sm:bottom-5 sm:left-5 sm:right-auto sm:w-80"
			aria-label={`Information om ${selectedMarker.title}`}
		>
			<div class="flex items-start justify-between gap-3">
				<h2 class="min-w-0 text-balance text-xl font-semibold text-slate-900">
					{selectedMarker.title}
				</h2>
				<button
					type="button"
					class="-m-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
					onclick={closePreview}
					aria-label="Stäng förhandsvisning"
				>
					<X size={20} strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>
			<p class="mt-2 text-sm text-slate-600">{selectedMarker.location}</p>
			<div class="mt-3">
				<BarAttributePills attributes={selectedMarker.attributes} />
			</div>
			<p class="mt-3 text-sm font-semibold tabular-nums text-slate-800">
				Helhetsbetyg: {selectedMarker.rating}/3
			</p>
			<a
				href={resolve('/[slug]', { slug: encodeURIComponent(selectedMarker.slug) })}
				class="btn btn-primary mt-4"
			>
				Läs recension
			</a>
		</section>
	{/if}
</div>

<style>
	:global(.bar-map-marker-positioner) {
		width: 2rem;
		height: 2rem;
	}

	:global(.bar-map-marker-positioner:focus-within) {
		z-index: 1;
	}

	@media (hover: hover) and (pointer: fine) {
		:global(.bar-map-marker-positioner:hover) {
			z-index: 1;
		}

		:global(.bar-map-marker:hover) {
			transform: scale(1.08);
		}
	}

	:global(.bar-map-marker-positioner.is-selected) {
		z-index: 2;
	}

	:global(.bar-map-marker) {
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		cursor: pointer;
		border: 3px solid var(--color-on-photo);
		border-radius: 9999px;
		background: var(--color-ember);
		box-shadow: 0 4px 12px color-mix(in oklab, var(--color-slate-950) 30%, transparent);
		transition:
			transform 150ms cubic-bezier(0.16, 1, 0.3, 1),
			background-color 150ms ease-out;
	}

	:global(.bar-map-marker::after) {
		width: 0.42rem;
		height: 0.42rem;
		content: '';
		border-radius: 9999px;
		background: var(--color-on-photo);
	}

	:global(.bar-map-marker.is-selected) {
		transform: scale(1.14);
		background: var(--color-primary-gray);
	}

	:global(.bar-map-marker:focus-visible) {
		outline: 3px solid var(--color-sky-500);
		outline-offset: 3px;
	}

	:global(.bar-map-marker-price) {
		position: absolute;
		top: 50%;
		left: calc(100% + 0.375rem);
		padding: 0.38rem 0.55rem;
		pointer-events: none;
		transform: translateY(-50%);
		border-radius: 9999px;
		background: var(--color-white);
		box-shadow: 0 4px 12px color-mix(in oklab, var(--color-slate-950) 20%, transparent);
		color: var(--color-slate-900);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		white-space: nowrap;
		transition:
			color 150ms ease-out,
			background-color 150ms ease-out;
	}

	:global(.bar-map-marker-positioner.is-selected .bar-map-marker-price) {
		background: var(--color-primary-gray);
		color: var(--color-on-photo);
	}

	:global(.bar-map-marker-description) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	:global(.bar-map-user-location-positioner) {
		z-index: 1;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	:global(.bar-map-user-location-accuracy),
	:global(.bar-map-user-location-dot) {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		transform: translate(-50%, -50%);
		border-radius: 9999px;
	}

	:global(.bar-map-user-location-accuracy) {
		border: 1px solid color-mix(in oklab, var(--color-sky-500) 36%, transparent);
		background: color-mix(in oklab, var(--color-sky-400) 16%, transparent);
	}

	:global(.bar-map-user-location-dot) {
		width: 1rem;
		height: 1rem;
		border: 3px solid var(--color-on-photo);
		background: var(--color-sky-500);
		box-shadow: 0 2px 10px color-mix(in oklab, var(--color-slate-950) 30%, transparent);
	}

	:global(.maplibregl-ctrl-group) {
		overflow: hidden;
		border-radius: 1rem;
		box-shadow: 0 4px 12px color-mix(in oklab, var(--color-slate-950) 18%, transparent);
	}

	:global(.maplibregl-ctrl-group button) {
		width: 2.4rem;
		height: 2.4rem;
	}

	:global(.maplibregl-ctrl-attrib) {
		border-radius: 0.5rem 0 0 0;
		background: color-mix(in oklab, var(--color-white) 85%, transparent);
	}
</style>
