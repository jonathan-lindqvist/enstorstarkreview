<script lang="ts">
	import { BAR_ATTRIBUTES, normalizeBarAttributes } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

	interface Props {
		selected: BarAttributeKey[];
		onChange: (attributes: BarAttributeKey[]) => void;
		presentation?: 'inline' | 'floating';
	}
	let { selected, onChange, presentation = 'inline' }: Props = $props();
	const panelId = $props.id();
	let open = $state(false);
	let toggleButton: HTMLButtonElement | undefined;
	let panel: HTMLFieldSetElement | undefined;

	function positionPanel() {
		if (presentation !== 'floating' || !panel || !toggleButton) return;
		const anchor = toggleButton.getBoundingClientRect();
		const width = Math.min(384, window.innerWidth - 32);
		panel.style.left = `${Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16))}px`;
		panel.style.top = `${anchor.bottom + 12}px`;
		panel.style.maxHeight = `${Math.max(0, window.innerHeight - anchor.bottom - 28)}px`;
	}

	function closePanel() {
		if (presentation === 'floating') panel?.hidePopover();
		open = false;
	}

	function togglePanel() {
		if (open) {
			closePanel();
		} else {
			if (presentation === 'floating') {
				positionPanel();
				panel?.showPopover();
			}
			open = true;
		}
	}

	function synchronizePopover(event: Event) {
		if (presentation === 'floating') open = (event as ToggleEvent).newState === 'open';
	}

	const handleKeydown = (event: KeyboardEvent) => {
		if (
			open &&
			event.key === 'Escape' &&
			(event.target === toggleButton || panel?.contains(event.target as Node))
		) {
			event.preventDefault();
			closePanel();
			toggleButton?.focus();
		}
	};

	const toggle = (key: BarAttributeKey) => {
		onChange(
			normalizeBarAttributes(
				selected.includes(key) ? selected.filter((value) => value !== key) : [...selected, key]
			)
		);
	};
</script>

<svelte:window onkeydown={handleKeydown} onresize={positionPanel} />

<button
	bind:this={toggleButton}
	type="button"
	aria-label="Filter"
	aria-expanded={open}
	aria-controls={panelId}
	aria-describedby={`${panelId}-status`}
	title={open ? 'Stäng filter' : 'Öppna filter'}
	onclick={togglePanel}
	class="relative inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 {open ||
	selected.length
		? 'chip-on'
		: 'chip-off'}"
>
	<SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
	{#if selected.length}
		<span
			aria-hidden="true"
			class="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-xs font-semibold tabular-nums text-white"
			>{selected.length}</span
		>
	{/if}
</button>
<span id={`${panelId}-status`} class="sr-only"
	>{selected.length === 1
		? '1 aktivt filter'
		: selected.length
			? `${selected.length} aktiva filter`
			: 'Inga aktiva filter'}</span
>

<fieldset
	bind:this={panel}
	id={panelId}
	hidden={presentation === 'inline' && !open}
	popover={presentation === 'floating' ? 'auto' : undefined}
	onbeforetoggle={synchronizePopover}
	aria-labelledby={`${panelId}-label`}
	class={presentation === 'floating'
		? 'fixed m-0 w-[min(24rem,calc(100vw-2rem))] min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900'
		: 'w-full border-0 border-t border-slate-200 pt-4'}
>
	<p id={`${panelId}-label`} class="field-label mb-3">Filtrera på aktiviteter och utbud</p>
	<div class="flex flex-wrap gap-1.5">
		{#each BAR_ATTRIBUTES as attribute (attribute.key)}
			<button
				type="button"
				aria-pressed={selected.includes(attribute.key)}
				onclick={() => toggle(attribute.key)}
				class="chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 {selected.includes(
					attribute.key
				)
					? 'chip-on'
					: 'chip-off'}"
			>
				{attribute.label}
			</button>
		{/each}
		{#if selected.length}
			<button
				type="button"
				onclick={() => onChange([])}
				class="min-h-11 cursor-pointer rounded-full px-3 py-2 text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
			>
				Rensa filter
			</button>
		{/if}
	</div>
	<p class="field-help mt-3">Visar barer som har minst ett av de valda attributen.</p>
</fieldset>
