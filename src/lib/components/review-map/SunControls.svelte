<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import type { SunShadowSettings } from '$lib/types/sun-shadows';
	import {
		changeShadowDate,
		shadowDateLabel,
		shadowDay,
		shadowTime
	} from '$lib/utils/sun-shadow-time';

	let { settings = $bindable() }: { settings: SunShadowSettings } = $props();
	const panelId = $props.id();
	let button = $state<HTMLButtonElement>();
	let panel: HTMLFieldSetElement | undefined;
	let open = $state(false);
	let live = $state(true);
	let dateValue = $state('');
	let dateError = $state(false);
	let currentTimestamp = $state(Date.now());
	const time = $derived(shadowTime(settings.timestamp));
	const dateLabel = $derived(shadowDateLabel(settings.timestamp, currentTimestamp));
	const day = $derived(shadowDay(time.date)!);
	const elapsed = $derived(
		Math.min(day.minutes - 5, Math.floor((settings.timestamp - day.start) / 300_000) * 5)
	);

	function closePanel() {
		panel?.hidePopover();
		open = false;
	}

	function positionPanel() {
		if (!panel || !button) return;
		const anchor = button.getBoundingClientRect();
		const width = Math.min(384, window.innerWidth - 32);
		panel.style.left = `${Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16))}px`;
		panel.style.top = `${anchor.bottom + 12}px`;
		panel.style.maxHeight = `${Math.max(0, window.innerHeight - anchor.bottom - 28)}px`;
	}

	function toggleSun() {
		const enabled = !settings.enabled;
		currentTimestamp = Date.now();
		settings = {
			enabled,
			timestamp: live || !settings.timestamp ? currentTimestamp : settings.timestamp
		};
		if (!enabled) closePanel();
	}

	function togglePanel() {
		if (open) closePanel();
		else {
			dateValue = time.date;
			dateError = false;
			positionPanel();
			panel?.showPopover();
		}
	}

	function synchronizePopover(event: Event) {
		open = (event as ToggleEvent).newState === 'open';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (
			open &&
			event.key === 'Escape' &&
			(event.target === button || panel?.contains(event.target as Node))
		) {
			event.preventDefault();
			closePanel();
			button?.focus();
		}
	}

	function changeDate(event: Event) {
		dateValue = (event.currentTarget as HTMLInputElement).value;
		const timestamp = changeShadowDate(settings.timestamp, dateValue);
		dateError = timestamp === null;
		if (timestamp !== null) {
			live = false;
			settings = { ...settings, timestamp };
		}
	}

	function changeTime(event: Event) {
		const minutes = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(minutes) || minutes < 0 || minutes > day.minutes - 5) return;
		live = false;
		settings = { ...settings, timestamp: day.start + minutes * 60_000 };
	}

	function useNow() {
		live = true;
		currentTimestamp = Date.now();
		settings = { ...settings, timestamp: currentTimestamp };
		dateValue = shadowTime(settings.timestamp).date;
		dateError = false;
	}

	$effect(() => {
		if (!settings.enabled) return;
		function refreshLiveTime() {
			if (!settings.enabled || document.hidden) return;
			currentTimestamp = Date.now();
			if (live) useNow();
		}
		const timer = setInterval(refreshLiveTime, 60_000);
		document.addEventListener('visibilitychange', refreshLiveTime);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshLiveTime);
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} onresize={positionPanel} />

<div class="pointer-events-auto flex shrink-0 items-center gap-1">
	<button
		type="button"
		aria-label="Sol/skugga"
		aria-pressed={settings.enabled}
		title={settings.enabled ? 'Dölj byggnadsskuggor' : 'Visa sol och skugga'}
		onclick={toggleSun}
		class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 sm:px-3 {settings.enabled
			? 'chip-on'
			: 'chip-off'}"
	>
		<Sun size={20} strokeWidth={1.75} aria-hidden="true" />
		<span class="hidden text-sm font-medium sm:inline">Sol/skugga</span>
	</button>
	{#if settings.enabled}
		<button
			bind:this={button}
			type="button"
			aria-label="Välj datum och tid för skuggor"
			aria-describedby={`${panelId}-selection`}
			aria-expanded={open}
			aria-controls={panelId}
			title={`${time.date} ${time.time} ${time.zone}`}
			onclick={togglePanel}
			class="chip-off inline-flex h-11 min-w-11 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
		>
			<span id={`${panelId}-selection`} class="sr-only">{time.date} {time.time} {time.zone}</span>
			<span class="whitespace-nowrap text-xs leading-4 text-slate-600">{dateLabel}</span>
			<span class="text-sm font-medium leading-5">{time.time}</span>
		</button>
	{/if}
</div>

<fieldset
	bind:this={panel}
	id={panelId}
	popover="auto"
	onbeforetoggle={synchronizePopover}
	aria-labelledby={`${panelId}-label`}
	class="pointer-events-auto fixed m-0 w-[min(24rem,calc(100vw-2rem))] min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 text-slate-900"
>
	<p id={`${panelId}-label`} class="mb-4 font-semibold">Sol och skugga</p>
	<label class="field-label" for={`${panelId}-date`}>Datum</label>
	<input
		class="field mt-1"
		id={`${panelId}-date`}
		type="date"
		value={dateValue}
		oninput={changeDate}
		aria-invalid={dateError}
		aria-describedby={dateError ? `${panelId}-error` : undefined}
	/>
	{#if dateError}<p id={`${panelId}-error`} class="field-error">Välj ett giltigt datum.</p>{/if}
	<div class="mt-4 flex items-center justify-between gap-3">
		<label class="field-label" for={`${panelId}-time`}>Tid på dagen</label>
		<output for={`${panelId}-time`} class="text-sm tabular-nums">{time.time} {time.zone}</output>
	</div>
	<input
		id={`${panelId}-time`}
		type="range"
		min="0"
		max={day.minutes - 5}
		step="5"
		value={elapsed}
		oninput={changeTime}
		aria-valuetext={`${time.time} ${time.zone}, svensk tid`}
		class="mt-1 min-h-11 w-full cursor-pointer accent-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
	/>
	<button type="button" onclick={useNow} aria-pressed={live} class="btn btn-secondary mt-2"
		>Nu</button
	>
	<p class="field-help mt-4">
		Uppskattade byggnadsskuggor. Terräng, träd, markiser och moln ingår inte.
	</p>
	<p class="field-help mt-2">Svensk tid. Underlaget nära kartans kanter kan vara ofullständigt.</p>
</fieldset>
