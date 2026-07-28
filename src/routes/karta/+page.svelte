<script lang="ts">
	import ReviewMap from '$lib/components/ReviewMap.svelte';
	import type { PublicReviewMapData } from '$lib/server/review-map';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let updatedMapData = $state<PublicReviewMapData | null>(null);
	let mapData = $derived(updatedMapData ?? data.map);
	let isResolving = $state(false);
	let mapReady = $state(false);
	let canResolveLocations = $derived(Boolean(data.user));

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

<svelte:head>
	<title>Karta</title>
	<meta
		name="description"
		content="Se alla recenserade barer på karta och hitta nästa ställe för en stor stark."
	/>
</svelte:head>

<section class="relative overflow-hidden px-4 pb-14 pt-8 sm:px-8 sm:pt-10">
	<div class="pointer-events-none absolute inset-0 -z-10">
		<div class="absolute -left-24 top-0 h-72 w-72 rounded-full bg-white/80 blur-3xl"></div>
		<div class="absolute right-0 top-20 h-80 w-80 rounded-full bg-sky-100/70 blur-3xl"></div>
		<div class="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl"></div>
	</div>

	<div class="mx-auto w-full max-w-6xl">
		<div
			class="rounded-[2rem] border border-white/85 bg-white/65 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_16px_40px_-34px_rgba(148,163,184,0.5)] backdrop-blur-2xl sm:p-8"
		>
			<p class="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
				En stor stark review
			</p>
			<h1 class="mt-4 text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">
				Hitta nästa bar på kartan.
			</h1>
			<div class="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
				<p>Tryck på en punkt för att se recensionen och hitta rätt ställe för nästa kväll.</p>
			</div>
		</div>

		<div class="mt-6">
			<ReviewMap markers={mapData.markers} onReady={handleMapReady} />
		</div>

		{#if mapData.totalReviews === 0}
			<p
				class="mt-4 rounded-2xl border border-white/90 bg-white/70 p-4 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
			>
				Det finns inga publicerade recensioner att visa ännu.
			</p>
		{:else if mapData.markers.length === 0}
			<p
				class="mt-4 rounded-2xl border border-white/90 bg-white/70 p-4 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
			>
				{#if canResolveLocations}
					Platser läggs till på kartan i takt med att adresser hämtas. Ladda om senare för att se
					fler.
				{:else}
					Platser läggs till på kartan när en inloggad redaktör har hämtat fler adresser.
				{/if}
			</p>
		{/if}
	</div>
</section>
