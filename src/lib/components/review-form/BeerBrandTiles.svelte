<script lang="ts">
	import Beer from '@lucide/svelte/icons/beer';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import { BEER_BRANDS, OTHER_BEER_BRAND_VALUE, beerBrandImage } from '$lib/beer-brands';

	interface Props {
		selection: string;
		otherLabel: string;
		required?: boolean;
		onchange?: () => void;
		/** Called when a tile is clicked or confirmed with Enter/Space, but not on arrow keys. */
		onpick?: () => void;
		oninvalid?: (event: Event) => void;
	}

	let {
		selection = $bindable(),
		otherLabel,
		required = false,
		onchange,
		onpick,
		oninvalid
	}: Props = $props();

	const options = $derived([
		...[...BEER_BRANDS]
			.sort((a, b) => a.localeCompare(b, 'sv'))
			.map((brand) => ({ value: brand, label: brand, image: beerBrandImage(brand) })),
		{ value: OTHER_BEER_BRAND_VALUE, label: otherLabel, image: null }
	]);

	function handleClick(event: MouseEvent) {
		// Arrow-key selection fires a synthetic click with detail 0.
		if (event.detail > 0) onpick?.();
	}

	function handleKeydown(event: KeyboardEvent, value: string) {
		if (!onpick || (event.key !== 'Enter' && event.key !== ' ')) return;
		event.preventDefault();
		if (selection !== value) {
			selection = value;
			onchange?.();
		}
		onpick();
	}
</script>

<div class="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5">
	{#each options as option (option.value)}
		{@const checked = selection === option.value}
		<label class="relative flex cursor-pointer flex-col items-center gap-1.5 text-center">
			<input
				type="radio"
				name="beer-brand"
				value={option.value}
				bind:group={selection}
				{required}
				{onchange}
				{oninvalid}
				onclick={handleClick}
				onkeydown={(event) => handleKeydown(event, option.value)}
				class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
			/>
			<span
				class="relative block aspect-square w-full overflow-hidden rounded-xl ring-1 ring-slate-200 transition-shadow duration-150 peer-hover:ring-slate-400 peer-checked:ring-3 peer-checked:ring-amber-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-sky-500 motion-reduce:transition-none"
			>
				{#if option.image}
					<img
						src={option.image}
						alt=""
						width="256"
						height="256"
						loading="lazy"
						decoding="async"
						class="size-full object-contain"
					/>
				{:else}
					<span class="flex size-full items-center justify-center bg-amber-100 text-amber-800">
						{#if option.value === OTHER_BEER_BRAND_VALUE}
							<Plus class="size-8" aria-hidden="true" />
						{:else}
							<Beer class="size-8" aria-hidden="true" />
						{/if}
					</span>
				{/if}
				{#if checked}
					<span
						class="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-amber-700 text-white"
					>
						<Check class="size-4" aria-hidden="true" />
					</span>
				{/if}
			</span>
			<span
				class="text-xs leading-tight font-medium text-balance sm:text-sm {checked
					? 'text-amber-900'
					: 'text-slate-700'}"
			>
				{option.label}
			</span>
		</label>
	{/each}
</div>
