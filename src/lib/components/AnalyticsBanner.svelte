<script lang="ts">
	type ConsentState = 'unset' | 'granted' | 'denied';
	type GtagFunction = (...parameters: unknown[]) => void;
	type AnalyticsWindow = Window & { gtag?: GtagFunction };

	interface Props {
		consent: ConsentState;
	}

	let { consent = 'unset' }: Props = $props();
	let dismissed = $state(false);
	const visible = $derived(consent === 'unset' && !dismissed);

	const consentCookie = (value: 'granted' | 'denied') => {
		const maxAge = 60 * 60 * 24 * 365;
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `analytics_consent=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
	};

	const updateConsent = (value: 'granted' | 'denied') => {
		consent = value;
		dismissed = true;
		consentCookie(value);

		const gtag = (window as AnalyticsWindow).gtag;
		if (typeof gtag === 'function') {
			gtag('consent', 'update', {
				analytics_storage: value,
				ad_storage: 'denied',
				ad_user_data: 'denied',
				ad_personalization: 'denied'
			});
		}
	};

	const accept = () => updateConsent('granted');
	const decline = () => updateConsent('denied');
</script>

{#if visible}
	<div
		class="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-2xl border border-white/85 bg-white/90 p-4 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:left-6 sm:right-6"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-1">
				<p class="text-sm font-semibold text-slate-900">Vi använder Google Analytics</p>
				<p class="text-xs leading-relaxed text-slate-600">
					Hjälp oss förbättra sajten med en liten anonymiserad mätning. Du kan fortsätta utan att
					acceptera.
				</p>
			</div>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={decline}
					class="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
				>
					Avböj
				</button>
				<button
					type="button"
					onclick={accept}
					class="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800"
				>
					Godkänn
				</button>
			</div>
		</div>
	</div>
{/if}
