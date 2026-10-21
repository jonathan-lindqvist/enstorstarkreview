<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import {
		MAX_BEER_BRAND_LENGTH,
		OTHER_BEER_BRAND_VALUE,
		OTHER_BEER_BRAND_LABEL,
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

	const PANEL_GAP_PX = 8;
	const VIEWPORT_GUTTER_PX = 16;
	const PANEL_MIN_WIDTH_PX = 288;
	const PANEL_MAX_WIDTH_PX = 640;

	let trigger = $state<HTMLButtonElement>();
	let panel = $state<HTMLDivElement>();
	let open = $state(false);
	let missingSelection = $state(false);
	let placement = $state({ top: '', bottom: '', left: '', width: '', maxHeight: '' });

	const selectedImage = $derived(beerBrandImage(beerBrandSelection));
	const selectedLabel = $derived(
		beerBrandSelection === OTHER_BEER_BRAND_VALUE ? OTHER_BEER_BRAND_LABEL : beerBrandSelection
	);
	const showError = $derived(hasError('beer-brand') || (missingSelection && !beerBrandSelection));

	$effect(() => {
		if (!open) return;
		positionPanel();
		void focusSelectedTile();
		window.addEventListener('resize', positionPanel);
		window.addEventListener('scroll', positionPanel, true);
		return () => {
			window.removeEventListener('resize', positionPanel);
			window.removeEventListener('scroll', positionPanel, true);
		};
	});

	// The popover sits in the top layer, so it is placed against the trigger by hand.
	function positionPanel() {
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const width = Math.min(
			Math.max(rect.width, PANEL_MIN_WIDTH_PX),
			PANEL_MAX_WIDTH_PX,
			innerWidth - 2 * VIEWPORT_GUTTER_PX
		);
		const left = Math.min(
			Math.max(rect.left, VIEWPORT_GUTTER_PX),
			innerWidth - width - VIEWPORT_GUTTER_PX
		);
		const spaceBelow = innerHeight - rect.bottom - PANEL_GAP_PX - VIEWPORT_GUTTER_PX;
		const spaceAbove = rect.top - PANEL_GAP_PX - VIEWPORT_GUTTER_PX;
		const below = spaceBelow >= 320 || spaceBelow >= spaceAbove;
		placement = {
			top: below ? `${rect.bottom + PANEL_GAP_PX}px` : '',
			bottom: below ? '' : `${innerHeight - rect.top + PANEL_GAP_PX}px`,
			left: `${left}px`,
			width: `${width}px`,
			maxHeight: `${below ? spaceBelow : spaceAbove}px`
		};
	}

	async function focusSelectedTile() {
		await tick();
		const tile =
			panel?.querySelector<HTMLInputElement>('input:checked') ??
			panel?.querySelector<HTMLInputElement>('input');
		tile?.focus({ preventScroll: true });
	}

	function handleToggle(event: Event) {
		open = (event as ToggleEvent).newState === 'open';
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

	// Closed popover tiles cannot show the browser's bubble, so point at the trigger instead.
	function handleInvalid(event: Event) {
		event.preventDefault();
		if (missingSelection && document.activeElement === trigger) return;
		missingSelection = true;
		trigger?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		trigger?.focus({ preventScroll: true });
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
		aria-describedby={showError ? 'beer-brand-error' : undefined}
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
		{/if}
		<span
			id="beer-brand-value"
			class="min-w-0 flex-1 truncate {beerBrandSelection ? '' : 'text-slate-500'}"
		>
			{selectedLabel || 'Välj öl'}
		</span>
		<ChevronDown
			class="size-5 shrink-0 text-slate-500 transition-transform duration-150 motion-reduce:transition-none {open
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	</button>
	<div
		id="beer-brand-options"
		popover="auto"
		role="dialog"
		aria-label="Välj öl"
		class="inset-auto m-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-300 bg-white p-3 text-slate-900 shadow-md"
		style:top={placement.top}
		style:bottom={placement.bottom}
		style:left={placement.left}
		style:width={placement.width}
		style:max-height={placement.maxHeight}
		ontoggle={handleToggle}
		bind:this={panel}
	>
		<BeerBrandTiles
			bind:selection={beerBrandSelection}
			otherLabel={OTHER_BEER_BRAND_LABEL}
			layout="list"
			required
			onpick={handlePick}
			oninvalid={handleInvalid}
		/>
	</div>
	{#if showError}
		<p id="beer-brand-error" class="field-error mt-2">
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
