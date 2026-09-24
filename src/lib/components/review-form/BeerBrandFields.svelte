<script lang="ts">
	import {
		BEER_BRANDS,
		MAX_BEER_BRAND_LENGTH,
		OTHER_BEER_BRAND_VALUE,
		OTHER_BEER_BRAND_LABEL
	} from '$lib/beer-brands';
	interface Props {
		hasError: (field: string) => boolean;
		getFieldErrorMessage: (field: string, fallback: string) => string;
		beerBrandSelection: string;
		customBeerBrand: string;
	}
	let {
		hasError,
		getFieldErrorMessage,
		beerBrandSelection = $bindable(),
		customBeerBrand = $bindable()
	}: Props = $props();
</script>

<div class="mt-4">
	<label
		for="beer-brand"
		class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
		>Öl för en stor stark</label
	>
	<select
		name="beer-brand"
		id="beer-brand"
		class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
			'beer-brand'
		)
			? 'ring-2 ring-red-600'
			: ''}"
		bind:value={beerBrandSelection}
		required
	>
		<option value="" disabled>Välj öl</option>
		{#each BEER_BRANDS as beerBrand}
			<option value={beerBrand}>{beerBrand}</option>
		{/each}
		<option value={OTHER_BEER_BRAND_VALUE}>{OTHER_BEER_BRAND_LABEL}</option>
	</select>
	{#if hasError('beer-brand')}
		<p class="text-red-400 text-xs mt-1">
			{getFieldErrorMessage('beer-brand', 'Välj vilken öl som serveras')}
		</p>
	{/if}
</div>

{#if beerBrandSelection === OTHER_BEER_BRAND_VALUE}
	<div class="mt-4">
		<label
			for="custom-beer-brand"
			class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
			>Ange vilken öl</label
		>
		<input
			type="text"
			name="custom-beer-brand"
			id="custom-beer-brand"
			maxlength={MAX_BEER_BRAND_LENGTH}
			class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
				'custom-beer-brand'
			)
				? 'ring-2 ring-red-600'
				: ''}"
			bind:value={customBeerBrand}
			required
		/>
		{#if hasError('custom-beer-brand')}
			<p class="text-red-400 text-xs mt-1">
				{getFieldErrorMessage('custom-beer-brand', 'Ange ett giltigt ölnamn')}
			</p>
		{/if}
	</div>
{/if}
