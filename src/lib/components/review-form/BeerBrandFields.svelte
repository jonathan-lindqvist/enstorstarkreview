<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import {
		MAX_BEER_BRAND_LENGTH,
		OTHER_BEER_BRAND_VALUE,
		OTHER_BEER_BRAND_LABEL,
		UNKNOWN_BEER_BRAND_CHOICE_LABEL,
		UNKNOWN_BEER_BRAND_VALUE,
		beerBrandImage
	} from '$lib/beer-brands';
	import BeerBrandTiles from './BeerBrandTiles.svelte';

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

	let trigger = $state<HTMLButtonElement>();
	let panel = $state<HTMLDivElement>();

	const isUnknown = $derived(beerBrandSelection === UNKNOWN_BEER_BRAND_VALUE);
	const selectedImage = $derived(beerBrandImage(beerBrandSelection));
	const selectedLabel = $derived(
		beerBrandSelection === OTHER_BEER_BRAND_VALUE
			? OTHER_BEER_BRAND_LABEL
			: isUnknown
				? UNKNOWN_BEER_BRAND_CHOICE_LABEL
				: beerBrandSelection
	);
	const showError = $derived(hasError('beer-brand'));

	async function focusSelectedTile() {
		await tick();
		const tile =
			panel?.querySelector<HTMLInputElement>('input:checked') ??
			panel?.querySelector<HTMLInputElement>('input');
		tile?.focus();
	}

	function handleToggle(event: Event) {
		if ((event as ToggleEvent).newState === 'open') void focusSelectedTile();
	}

	async function handlePick() {
		panel?.hidePopover();
		await tick();
		if (beerBrandSelection === OTHER_BEER_BRAND_VALUE) {
			document.getElementById('custom-beer-brand')?.focus();
		} else {
			trigger?.focus();
		}
	}
</script>

<div class="mt-6">
	<label for="beer-brand" id="beer-brand-label" class="field-label mb-2">Öl för en stor stark</label
	>
	<button
		type="button"
		id="beer-brand"
		popovertarget="beer-brand-options"
		aria-labelledby="beer-brand-label beer-brand-value"
		aria-describedby={showError ? 'beer-brand-error' : 'beer-brand-help'}
		class="field flex cursor-pointer items-center gap-3 py-2 text-left {showError
			? 'border-red-500! ring-2 ring-red-100'
			: ''}"
		bind:this={trigger}
	>
		{#if selectedImage}
			<img
				src={selectedImage}
				alt=""
				width="256"
				height="256"
				class="size-9 shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-200"
			/>
		{:else if beerBrandSelection === OTHER_BEER_BRAND_VALUE}
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800"
			>
				<Plus class="size-5" aria-hidden="true" />
			</span>
		{:else if isUnknown}
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
			>
				<CircleHelp class="size-5" aria-hidden="true" />
			</span>
		{/if}
		<span id="beer-brand-value" class="min-w-0 flex-1 truncate {isUnknown ? 'text-slate-500' : ''}">
			{selectedLabel}
		</span>
		<ChevronDown class="size-5 shrink-0 text-slate-500" aria-hidden="true" />
	</button>
	<!-- Near full screen on phones, a large centred panel on wider screens. -->
	<div
		id="beer-brand-options"
		popover="auto"
		role="dialog"
		aria-labelledby="beer-brand-options-title"
		class="inset-0 m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100%-2rem)] max-w-none flex-col overflow-hidden rounded-3xl bg-white text-slate-900 shadow-xl open:flex backdrop:bg-slate-950/50 sm:h-fit sm:max-h-[85dvh] sm:max-w-3xl"
		ontoggle={handleToggle}
		bind:this={panel}
	>
		<div
			class="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6"
		>
			<h2 id="beer-brand-options-title" class="font-serif text-xl font-semibold">Välj öl</h2>
			<button
				type="button"
				popovertarget="beer-brand-options"
				popovertargetaction="hide"
				class="btn btn-secondary size-11 px-0"
				aria-label="Stäng"
			>
				<X class="size-5" aria-hidden="true" />
			</button>
		</div>
		<div class="overflow-y-auto overscroll-contain p-4 sm:p-6">
			<BeerBrandTiles
				bind:selection={beerBrandSelection}
				otherLabel={OTHER_BEER_BRAND_LABEL}
				unknownLabel={UNKNOWN_BEER_BRAND_CHOICE_LABEL}
				onpick={handlePick}
			/>
		</div>
	</div>
	{#if showError}
		<p id="beer-brand-error" class="field-error mt-2">
			{getFieldErrorMessage('beer-brand', 'Välj vilken öl som serveras')}
		</p>
	{:else}
		<p id="beer-brand-help" class="field-help mt-2">Lämna som Okänd öl om du inte vet.</p>
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
