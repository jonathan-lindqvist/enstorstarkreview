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

<div class="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
	<div>
		<label
			for="beer-price"
			class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
			>Pris för en stor stark</label
		>
		<input
			type="number"
			name="beer-price"
			id="beer-price"
			min="1"
			max={MAX_BEER_PRICE_KR}
			step="1"
			inputmode="numeric"
			class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_85%,transparent)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
				'beer-price'
			)
				? 'ring-2 ring-red-600'
				: ''}"
			bind:value={beerPriceKr}
			required
		/>
		{#if hasError('beer-price')}
			<p class="text-red-400 text-xs mt-1">
				{getFieldErrorMessage('beer-price', 'Pris är obligatoriskt')}
			</p>
		{/if}
	</div>

	<label
		class="flex min-h-12 items-center gap-3 rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_85%,transparent)]"
	>
		<input
			type="checkbox"
			name="happy-hour-price"
			class="h-5 w-5 rounded border-white/85 accent-sky-500"
			bind:checked={isHappyHourPrice}
		/>
		<span>Happy hour</span>
	</label>
</div>
