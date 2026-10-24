<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		getBrowserPreferences,
		onPreferencesChange,
		setAnalyticsConsent
	} from '#lib/preferences.js';
	import type { AnalyticsConsent } from '#lib/types/preferences.js';

	interface Props {
		consent: AnalyticsConsent;
	}

	let { consent = 'unset' }: Props = $props();
	let currentConsent = $state(untrack(() => consent));
	let mounted = $state(false);
	const visible = $derived(mounted && currentConsent === 'unset');

	onMount(() => {
		mounted = true;
		function synchronizeConsent() {
			currentConsent = getBrowserPreferences().analyticsConsent;
		}
		synchronizeConsent();
		return onPreferencesChange(synchronizeConsent);
	});

	function accept() {
		setAnalyticsConsent('granted');
	}

	function decline() {
		setAnalyticsConsent('denied');
	}
</script>

{#if visible}
	<div
		class="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur-xl sm:left-6 sm:right-6"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-1">
				<p class="text-sm font-semibold text-slate-900">Vi använder Google Analytics</p>
				<p class="text-sm leading-relaxed text-slate-600">
					Du väljer om vi får använda analyscookies. Om du avböjer görs fortfarande en begränsad
					mätning utan analyscookies. Du kan ändra ditt val i
					<a href={resolve('/installningar')} class="font-semibold underline underline-offset-4"
						>Inställningar</a
					>.
				</p>
			</div>
			<div class="flex shrink-0 gap-2">
				<button type="button" onclick={decline} class="btn btn-secondary"> Avböj </button>
				<button type="button" onclick={accept} class="btn btn-secondary"> Godkänn </button>
			</div>
		</div>
	</div>
{/if}
