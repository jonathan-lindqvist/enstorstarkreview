<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Clock from '@lucide/svelte/icons/clock';
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import { BEER_BRANDS, MAX_BEER_BRAND_LENGTH, OTHER_BEER_BRAND_VALUE } from '$lib/beer-brands';
	import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
	import PriceRuler from './PriceRuler.svelte';

	interface Props {
		beerPriceKr: string | number | undefined;
		isHappyHourPrice: boolean;
		beerBrandSelection: string;
		customBeerBrand: string;
		problems: Record<string, string>;
	}

	let {
		beerPriceKr = $bindable(),
		isHappyHourPrice = $bindable(),
		beerBrandSelection = $bindable(),
		customBeerBrand = $bindable(),
		problems
	}: Props = $props();

	const brandError = $derived(problems['/beer-brand']);
	const priceError = $derived(problems['/beer-price']);
	const customError = $derived(problems['/custom-beer-brand']);
	const brands = [
		...BEER_BRANDS.map((brand) => ({ value: brand, label: brand })),
		{ value: OTHER_BEER_BRAND_VALUE, label: 'Annat märke' }
	];

	async function handleBrandChange() {
		if (beerBrandSelection !== OTHER_BEER_BRAND_VALUE) return;
		await tick();
		document.getElementById('custom-beer-brand')?.focus();
	}
</script>

<div class="space-y-7">
	<div>
		<h2 class="wizard-heading" tabindex="-1">Stor stark</h2>
		<p class="mt-1 text-slate-600">Vad kostade den, och vilket märke var det?</p>
	</div>

	<div>
		<label for="beer-price" class="field-label text-center">Pris för en stor stark</label>
		<div class="mt-1 flex items-baseline justify-center gap-1">
			<input
				type="number"
				name="beer-price"
				id="beer-price"
				min="1"
				max={MAX_BEER_PRICE_KR}
				step="1"
				inputmode="numeric"
				placeholder="–"
				class="price-input rounded-2xl bg-transparent text-center font-serif text-7xl font-semibold text-amber-700 tabular-nums placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
				aria-invalid={priceError ? true : undefined}
				aria-describedby={priceError ? 'beer-price-error' : 'beer-price-help'}
				style={`width: ${Math.max(String(beerPriceKr ?? '').length, 1) + 0.6}ch`}
				bind:value={beerPriceKr}
				required
			/>
			<span class="font-serif text-3xl font-semibold text-amber-700" aria-hidden="true">
				{isHappyHourPrice ? 'kr*' : 'kr'}
			</span>
		</div>
		<div class="mt-2">
			<PriceRuler bind:price={beerPriceKr} />
		</div>
		{#if priceError}
			<p id="beer-price-error" class="field-error mt-2 text-center">{priceError}</p>
		{:else}
			<p id="beer-price-help" class="field-help mt-1 text-center">
				Dra i linjalen eller skriv priset i hela kronor.
			</p>
		{/if}
	</div>

	<label
		class="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-slate-300 bg-white/85 px-4 py-3 hover:border-slate-400"
	>
		<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
			<Clock class="size-4 text-amber-800" aria-hidden="true" />
		</span>
		<span class="flex-1">
			<span class="block font-semibold text-slate-900">Happy hour-pris</span>
			<span class="block text-sm text-slate-600">Visas med * och räknas i statistiken</span>
		</span>
		<input
			type="checkbox"
			role="switch"
			name="happy-hour-price"
			class="switch"
			bind:checked={isHappyHourPrice}
		/>
	</label>

	<fieldset
		id="beer-brand"
		tabindex="-1"
		aria-describedby={brandError ? 'beer-brand-error' : undefined}
	>
		<legend class="field-label mb-3">Märke</legend>
		<div class="flex flex-wrap gap-2">
			{#each brands as brand (brand.value)}
				<label class="relative cursor-pointer">
					<input
						type="radio"
						name="beer-brand"
						value={brand.value}
						bind:group={beerBrandSelection}
						onchange={handleBrandChange}
						class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
					/>
					<span
						class="chip chip-off gap-1.5 peer-checked:border-amber-700 peer-checked:bg-amber-700 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-500"
					>
						{#if brand.value === OTHER_BEER_BRAND_VALUE}
							<Plus class="size-4" aria-hidden="true" />
						{:else if beerBrandSelection === brand.value}
							<Check class="size-4" aria-hidden="true" />
						{/if}
						{brand.label}
					</span>
				</label>
			{/each}
		</div>
		{#if brandError}
			<p id="beer-brand-error" class="field-error mt-2">{brandError}</p>
		{/if}
	</fieldset>

	{#if beerBrandSelection === OTHER_BEER_BRAND_VALUE}
		<div>
			<label for="custom-beer-brand" class="field-label mb-2">Märkets namn</label>
			<input
				type="text"
				name="custom-beer-brand"
				id="custom-beer-brand"
				maxlength={MAX_BEER_BRAND_LENGTH}
				class="field"
				aria-invalid={customError ? true : undefined}
				aria-describedby={customError ? 'custom-beer-brand-error' : undefined}
				bind:value={customBeerBrand}
				required
			/>
			{#if customError}
				<p id="custom-beer-brand-error" class="field-error mt-2">{customError}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.price-input {
		appearance: textfield;
	}

	.price-input::-webkit-inner-spin-button,
	.price-input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}

	/* A native checkbox drawn as a switch. */
	.switch {
		appearance: none;
		position: relative;
		flex-shrink: 0;
		width: 3.25rem;
		height: 2rem;
		border-radius: 9999px;
		background: var(--color-slate-300);
		cursor: pointer;
		transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.switch::after {
		content: '';
		position: absolute;
		top: 0.25rem;
		left: 0.25rem;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 9999px;
		background: var(--color-white);
		box-shadow: 0 1px 3px color-mix(in oklab, var(--color-slate-950) 30%, transparent);
		transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.switch:checked {
		background: var(--color-amber-700);
	}

	.switch:checked::after {
		transform: translateX(1.25rem);
	}

	.switch:focus-visible {
		outline: 2px solid var(--color-sky-500);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.switch,
		.switch::after {
			transition: none;
		}
	}
</style>
