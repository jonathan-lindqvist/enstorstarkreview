<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { PageProps } from './$types';
	import {
		getBrowserPreferences,
		onPreferencesChange,
		setAnalyticsConsent,
		setLocationEnabled
	} from '$lib/preferences';
	import { isDarkThemeActive, onThemeChange, setTheme, type Theme } from '$lib/theme';
	import type { AnalyticsConsent } from '$lib/types/preferences';

	let { data }: PageProps = $props();
	let locationEnabled = $state(untrack(() => data.locationEnabled));
	let analyticsConsent = $state<AnalyticsConsent>(untrack(() => data.analyticsConsent));
	let theme = $state<Theme>(untrack(() => data.theme));
	let ready = $state(false);
	const CONTROL =
		'size-5 shrink-0 cursor-pointer accent-amber-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500 disabled:cursor-not-allowed';
	const CHOICE =
		'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-base text-slate-800 transition-colors hover:bg-white/70 has-checked:bg-amber-100 has-checked:font-semibold has-checked:text-amber-950 has-disabled:cursor-not-allowed';

	onMount(() => {
		function synchronizePreferences() {
			const preferences = getBrowserPreferences();
			locationEnabled = preferences.locationEnabled;
			analyticsConsent = preferences.analyticsConsent;
		}
		function synchronizeTheme() {
			theme = isDarkThemeActive() ? 'dark' : 'light';
		}
		synchronizePreferences();
		synchronizeTheme();
		ready = true;
		const stopPreferences = onPreferencesChange(synchronizePreferences);
		const stopTheme = onThemeChange(synchronizeTheme);
		return () => {
			stopPreferences();
			stopTheme();
		};
	});

	function changeLocation(event: Event) {
		setLocationEnabled((event.currentTarget as HTMLInputElement).checked);
	}

	function changeTheme(event: Event) {
		setTheme((event.currentTarget as HTMLInputElement).value as Theme);
	}

	function changeAnalytics(event: Event) {
		setAnalyticsConsent((event.currentTarget as HTMLInputElement).value as 'granted' | 'denied');
	}
</script>

<div class="page-shell">
	<div class="mx-auto max-w-3xl">
		<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">Inställningar</h1>
	</div>
	<div class="glass-panel mx-auto mt-8 max-w-3xl p-6 sm:p-8">
		<noscript
			><p class="mt-4 text-slate-700">
				Aktivera JavaScript för att ändra inställningarna.
			</p></noscript
		>

		<section aria-labelledby="location-heading">
			<h2 id="location-heading" class="text-xl font-semibold text-slate-900">Platsåtkomst</h2>
			<p id="location-help" class="mt-2 text-base leading-relaxed text-slate-600">
				Visa avstånd till barer och din position på kartan. Platsåtkomst är på från början, men
				webbläsaren bestämmer behörigheten. Din position stannar i webbläsarens minne och sparas
				inte.
			</p>
			<label class="{CHOICE} mt-3">
				<input
					type="checkbox"
					class={CONTROL}
					checked={locationEnabled}
					onchange={changeLocation}
					aria-describedby="location-help"
					disabled={!ready}
				/>
				Använd min position
			</label>
			<p class="mt-2 text-sm leading-relaxed text-slate-600">
				Om du tidigare har nekat platsåtkomst behöver du också tillåta den i webbläsarens
				platsinställningar.
			</p>
		</section>

		<fieldset class="mt-8 border-t border-slate-200 pt-8" aria-describedby="theme-help">
			<legend class="float-left w-full text-xl font-semibold text-slate-900">Tema</legend>
			<div class="clear-both pt-2">
				<p id="theme-help" class="text-base leading-relaxed text-slate-600">
					Välj hur sajten ska se ut.
				</p>
				<div class="mt-3 grid gap-1 sm:grid-cols-2">
					{#each [{ value: 'light', label: 'Ljust' }, { value: 'dark', label: 'Mörkt' }] as choice (choice.value)}
						<label class={CHOICE}>
							<input
								type="radio"
								name="theme"
								value={choice.value}
								checked={theme === choice.value}
								class={CONTROL}
								onchange={changeTheme}
								disabled={!ready}
							/>
							{choice.label}
						</label>
					{/each}
				</div>
			</div>
		</fieldset>

		<fieldset class="mt-8 border-t border-slate-200 pt-8" aria-describedby="analytics-help">
			<legend class="float-left w-full text-xl font-semibold text-slate-900">Analys</legend>
			<div class="clear-both pt-2">
				<p id="analytics-help" class="text-base leading-relaxed text-slate-600">
					Hjälp oss förstå hur sajten används. Om du avböjer görs fortfarande en begränsad mätning
					utan analyscookies. Din position skickas aldrig.
				</p>
				<div class="mt-3 grid gap-1 sm:grid-cols-2">
					{#each [{ value: 'granted', label: 'Tillåt analyscookies' }, { value: 'denied', label: 'Avböj analyscookies' }] as choice (choice.value)}
						<label class={CHOICE}>
							<input
								type="radio"
								name="analytics"
								value={choice.value}
								checked={analyticsConsent === choice.value}
								class={CONTROL}
								onchange={changeAnalytics}
								disabled={!ready}
							/>
							{choice.label}
						</label>
					{/each}
				</div>
			</div>
		</fieldset>
	</div>
</div>
