<script lang="ts">
	import ReviewMap from '$lib/components/ReviewMap.svelte';
	import BarAttributeFilters from '$lib/components/BarAttributeFilters.svelte';
	import { matchesBarAttributes, setBarAttributeParams } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { PublicReviewMapData } from '$lib/types/review-map';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let attributes: BarAttributeKey[] = $derived(data.attributes);
	let updatedMapData = $state<PublicReviewMapData | null>(null);
	let mapData = $derived(updatedMapData ?? data.map);
	const filteredMarkers = $derived(
		mapData.markers.filter((marker) => matchesBarAttributes(marker.attributes, attributes))
	);
	let isResolving = $state(false);
	let mapReady = $state(false);
	let canResolveLocations = $derived(Boolean(data.user));

	const handleAttributesChange = (selected: BarAttributeKey[]) => {
		attributes = selected;
		const url = new URL(page.url);
		setBarAttributeParams(url.searchParams, selected);
		replaceState(resolve(`/karta${url.search}${url.hash}`), page.state);
	};

	const resolveNextMarker = async () => {
		if (isResolving || !mapReady || !canResolveLocations) return;
		isResolving = true;

		try {
			const response = await fetch('/karta/next-marker', {
				method: 'POST',
				headers: { accept: 'application/json' }
			});
			if (!response.ok || response.status === 204) return;

			const payload = (await response.json()) as { map: PublicReviewMapData };
			updatedMapData = payload.map;
		} catch (error) {
			console.error('Kunde inte hämta nästa kartmarkör:', error);
		} finally {
			isResolving = false;
		}
	};

	const handleMapReady = () => {
		mapReady = true;
		void resolveNextMarker();
	};
</script>

{#snippet mapMessages()}
	{#if mapData.totalReviews === 0}
		<p role="status" class="max-w-lg rounded-2xl bg-white/95 p-4 text-sm text-slate-700">
			Det finns inga publicerade recensioner att visa ännu.
		</p>
	{:else if mapData.markers.length > 0 && filteredMarkers.length === 0}
		<div class="max-w-lg rounded-2xl bg-white/95 p-4">
			<p role="status" class="font-semibold text-slate-900">Inga barer matchar dina filter.</p>
			<p class="mt-1 text-sm text-slate-600">Välj andra attribut eller rensa filtren.</p>
		</div>
	{:else if mapData.markers.length === 0}
		<p role="status" class="max-w-lg rounded-2xl bg-white/95 p-4 text-sm text-slate-700">
			{#if canResolveLocations}
				Platser läggs till på kartan i takt med att adresser hämtas. Ladda om senare för att se
				fler.
			{:else}
				Platser läggs till på kartan när en inloggad redaktör har hämtat fler adresser.
			{/if}
		</p>
	{/if}
{/snippet}

<ReviewMap
	markers={filteredMarkers}
	onReady={handleMapReady}
	messages={filteredMarkers.length === 0 ? mapMessages : undefined}
>
	{#snippet controls()}
		<div class="flex items-center gap-4">
			<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">Karta</h1>
			<div class="pointer-events-auto">
				<BarAttributeFilters
					selected={attributes}
					onChange={handleAttributesChange}
					presentation="floating"
				/>
			</div>
		</div>
		<p class="sr-only">
			Tryck på en punkt för att se recensionen och hitta rätt ställe för nästa kväll.
		</p>
	{/snippet}
</ReviewMap>
