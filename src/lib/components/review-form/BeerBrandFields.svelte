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

<div class="mt-6">
	<label for="beer-brand" class="field-label mb-2">Öl för en stor stark</label>
	<select
		name="beer-brand"
		id="beer-brand"
		class="field {hasError('beer-brand') ? 'border-red-500! ring-2 ring-red-100' : ''}"
		bind:value={beerBrandSelection}
		required
	>
		<option value="" disabled>Välj öl</option>
		{#each BEER_BRANDS as beerBrand (beerBrand)}
			<option value={beerBrand}>{beerBrand}</option>
		{/each}
		<option value={OTHER_BEER_BRAND_VALUE}>{OTHER_BEER_BRAND_LABEL}</option>
	</select>
	{#if hasError('beer-brand')}
		<p class="field-error mt-2">
			{getFieldErrorMessage('beer-brand', 'Välj vilken öl som serveras')}
		</p>
	{/if}
</div>

{#if beerBrandSelection === OTHER_BEER_BRAND_VALUE}
	<div class="mt-6">
		<label for="custom-beer-brand" class="field-label mb-2">Ange vilken öl</label>
		<input
			type="text"
			name="custom-beer-brand"
			id="custom-beer-brand"
			maxlength={MAX_BEER_BRAND_LENGTH}
			class="field {hasError('custom-beer-brand') ? 'border-red-500! ring-2 ring-red-100' : ''}"
			bind:value={customBeerBrand}
			required
		/>
		{#if hasError('custom-beer-brand')}
			<p class="field-error mt-2">
				{getFieldErrorMessage('custom-beer-brand', 'Ange ett giltigt ölnamn')}
			</p>
		{/if}
	</div>
{/if}
