<script lang="ts">
	import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
	interface Props {
		hasError: (field: string) => boolean;
		getFieldErrorMessage: (field: string, fallback: string) => string;
		beerPriceKr: string | number | undefined;
		isHappyHourPrice: boolean;
	}
	let {
		hasError,
		getFieldErrorMessage,
		beerPriceKr = $bindable(),
		isHappyHourPrice = $bindable()
	}: Props = $props();
</script>

<div class="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
	<div>
		<label for="beer-price" class="field-label mb-2">Pris för en stor stark</label>
		<input
			type="number"
			name="beer-price"
			id="beer-price"
			min="1"
			max={MAX_BEER_PRICE_KR}
			step="1"
			inputmode="numeric"
			class="field {hasError('beer-price') ? 'border-red-500! ring-2 ring-red-100' : ''}"
			bind:value={beerPriceKr}
			required
		/>
		{#if hasError('beer-price')}
			<p class="field-error mt-2">
				{getFieldErrorMessage('beer-price', 'Pris är obligatoriskt')}
			</p>
		{/if}
	</div>

	<label
		class="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-800 hover:border-slate-400"
	>
		<input
			type="checkbox"
			name="happy-hour-price"
			class="size-5 rounded accent-amber-700"
			bind:checked={isHappyHourPrice}
		/>
		<span>Happy hour</span>
	</label>
</div>
