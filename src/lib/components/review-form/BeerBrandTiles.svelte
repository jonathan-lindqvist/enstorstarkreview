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
		/** Big logo tiles, or compact rows for the form's dropdown. */
		layout?: 'tiles' | 'list';
	}

	let {
		selection = $bindable(),
		otherLabel,
		required = false,
		onchange,
		onpick,
		oninvalid,
		layout = 'tiles'
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

{#snippet radio(value: string)}
	<input
		type="radio"
		name="beer-brand"
		{value}
		bind:group={selection}
		{required}
		{onchange}
		{oninvalid}
		onclick={handleClick}
		onkeydown={(event) => handleKeydown(event, value)}
		class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
	/>
{/snippet}

{#snippet fallbackIcon(value: string, size: string)}
	{#if value === OTHER_BEER_BRAND_VALUE}
		<Plus class={size} aria-hidden="true" />
	{:else}
		<Beer class={size} aria-hidden="true" />
	{/if}
{/snippet}

{#if layout === 'list'}
	<div class="grid gap-1.5 sm:grid-cols-2">
		{#each options as option (option.value)}
			{@const checked = selection === option.value}
			<label
				class="relative flex cursor-pointer items-center gap-3 rounded-2xl p-2 transition-colors duration-150 hover:bg-slate-100 has-checked:bg-amber-50 has-focus-visible:outline-2 has-focus-visible:outline-sky-500 motion-reduce:transition-none"
			>
				{@render radio(option.value)}
				{#if option.image}
					<img
						src={option.image}
						alt=""
						width="256"
						height="256"
						loading="lazy"
						decoding="async"
						class="size-16 shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-200"
					/>
				{:else}
					<span
						class="flex size-16 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"
					>
						{@render fallbackIcon(option.value, 'size-7')}
					</span>
				{/if}
				<span
					class="min-w-0 flex-1 text-sm font-medium {checked ? 'text-amber-900' : 'text-slate-800'}"
				>
					{option.label}
				</span>
				{#if checked}
					<Check class="size-4 shrink-0 text-amber-700" aria-hidden="true" />
				{/if}
			</label>
		{/each}
	</div>
{:else}
	<div class="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4">
		{#each options as option (option.value)}
			{@const checked = selection === option.value}
			<label class="relative flex cursor-pointer flex-col items-center gap-1.5 text-center">
				{@render radio(option.value)}
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
							class="size-full bg-white object-contain"
						/>
					{:else}
						<span class="flex size-full items-center justify-center bg-amber-100 text-amber-800">
							{@render fallbackIcon(option.value, 'size-8')}
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
{/if}
