<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData } from './$types';

	type ReviewRequestActionData = ActionData & {
		values?: { barName: string; location: string; motivation: string };
		fieldErrors?: Partial<Record<'barName' | 'location' | 'motivation', string>>;
	};

	let { form }: { form: ReviewRequestActionData | null } = $props();
	let submitting = $state(false);

	const enhanceReviewRequest: SubmitFunction = () => {
		submitting = true;

		return async ({ update }) => {
			try {
				await update();
			} finally {
				submitting = false;
			}
		};
	};
</script>

<svelte:head>
	<title>FAQ</title>
	<meta name="description" content="Vanliga frågor om hur En Stor Stark Review fungerar" />
</svelte:head>

<div class="mx-auto w-full max-w-4xl px-4 pb-12 pt-6">
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-10"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">FAQ</p>
		<h1 class="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Vanliga frågor</h1>

		<div class="mt-8 space-y-7">
			<section>
				<h2 class="text-2xl font-semibold text-slate-900">Vad är En Stor Stark Review?</h2>
				<p class="mt-2 text-slate-700">
					En oberoende guide till barer. Vi besöker ställen, testar upplevelsen och skriver
					recensioner så att du slipper chansa när du planerar en utekväll.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold text-slate-900">Hur fungerar betygen?</h2>
				<p class="mt-2 text-slate-700">
					Varje bar får ett slutbetyg mellan 0 och 3 baserat på helhetsupplevelsen. Vi väger in
					flera faktorer, men håller modellen enkel i presentationen.
				</p>
				<ul class="mt-3 space-y-2 text-slate-700">
					<li><strong>0/3</strong>: Inget extra.</li>
					<li><strong>1/3</strong>: Sticker ut lite från mängden.</li>
					<li><strong>2/3</strong>: Riktigt bra.</li>
					<li><strong>3/3</strong>: Måste upplevas. Väldigt sällsynt.</li>
				</ul>
			</section>

			<section>
				<h2 class="text-2xl font-semibold text-slate-900">Vilka står bakom recensionerna?</h2>
				<p class="mt-2 text-slate-700">
					Vi är anonyma för att kunna bedöma varje ställe utan specialbehandling. Fokus ligger på
					upplevelsen, inte på vilka vi är.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold text-slate-900">Vad betyder era stickers?</h2>
				<p class="mt-2 text-slate-700">
					Stickers visar att en bar är recenserad av oss, och antalet stjärnor på stickern motsvarar
					direkt betyget i vår recension. På så sätt får du en snabb uppfattning direkt på plats.
				</p>
				<p class="mt-2 text-slate-700">
					För hela bilden och alla detaljer hänvisar vi alltid till recensionen här på sajten.
				</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold text-slate-900">Varför saknas vissa barer?</h2>
				<p class="mt-2 text-slate-700">Enkelt. Vi har inte varit där än.</p>
			</section>

			<section>
				<h2 class="text-2xl font-semibold text-slate-900">Hur fungerar kartan och integriteten?</h2>
				<p class="mt-2 text-slate-700">
					Kartan visar bara adresser från publicerade recensioner. För att visa kartan hämtar din
					webbläsare kartdata från OpenFreeMap. När vi behöver hitta koordinater för en publicerad
					adress skickar vår server adressen till Nominatim, en tjänst från OpenStreetMap. Anropen
					begränsas och resultaten sparas så att samma adress inte behöver hämtas igen.
				</p>
				<p class="mt-2 text-slate-700">
					När du öppnar kartan frågar webbläsaren om tillgång till din position. Om du tillåter det
					visas och uppdateras positionen bara i din webbläsare medan kartsidan är öppen. Vi skickar
					inte positionen till vår server eller Nominatim och sparar den inte.
				</p>
				<p class="mt-2 text-slate-700">
					Precis som vid andra externa webbförfrågningar kan OpenFreeMap behandla teknisk
					anslutningsdata och vilket kartområde som visas, till exempel IP-adress.
				</p>
			</section>
		</div>
	</div>

	<section
		class="mt-6 rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-10"
		aria-labelledby="review-request-heading"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Önska nästa besök</p>
		<h2 id="review-request-heading" class="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">
			Vilken bar borde vi recensera?
		</h2>
		<p class="mt-3 max-w-2xl text-slate-700">
			Tipsa oss om ett ställe och berätta gärna varför det borde stå näst på tur. Vi samlar inte in
			några kontaktuppgifter.
		</p>

		{#if form?.message}
			<div
				class="mt-6 rounded-2xl border p-4 text-sm {form.success
					? 'border-emerald-300/70 bg-emerald-50 text-emerald-800'
					: 'border-red-300/70 bg-red-50 text-red-700'}"
				role={form.success ? 'status' : 'alert'}
				aria-live="polite"
				data-testid="review-request-status"
			>
				{form.message}
			</div>
		{/if}

		<form
			action="?/requestReview"
			method="post"
			class="relative mt-6 flex max-w-2xl flex-col gap-5"
			aria-busy={submitting}
			use:enhance={enhanceReviewRequest}
			data-testid="review-request-form"
		>
			<div class="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
				<label for="review-request-website">Webbplats</label>
				<input
					type="text"
					id="review-request-website"
					name="website"
					tabindex="-1"
					autocomplete="off"
				/>
			</div>

			<div>
				<label for="review-request-bar-name" class="block font-semibold text-slate-800">
					Barens namn
				</label>
				<input
					type="text"
					id="review-request-bar-name"
					name="barName"
					value={form?.values?.barName ?? ''}
					required
					minlength="2"
					maxlength="100"
					autocomplete="organization"
					aria-invalid={form?.fieldErrors?.barName ? 'true' : undefined}
					aria-describedby={form?.fieldErrors?.barName
						? 'review-request-bar-name-error'
						: undefined}
					class="mt-2 min-h-12 w-full rounded-2xl border border-white/90 bg-white/85 px-4 py-3 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-100"
				/>
				{#if form?.fieldErrors?.barName}
					<p id="review-request-bar-name-error" class="mt-2 text-sm text-red-700">
						{form.fieldErrors.barName}
					</p>
				{/if}
			</div>

			<div>
				<label for="review-request-location" class="block font-semibold text-slate-800">
					Ort eller adress
				</label>
				<input
					type="text"
					id="review-request-location"
					name="location"
					value={form?.values?.location ?? ''}
					required
					minlength="2"
					maxlength="160"
					autocomplete="street-address"
					aria-invalid={form?.fieldErrors?.location ? 'true' : undefined}
					aria-describedby={form?.fieldErrors?.location
						? 'review-request-location-error'
						: undefined}
					class="mt-2 min-h-12 w-full rounded-2xl border border-white/90 bg-white/85 px-4 py-3 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-100"
				/>
				{#if form?.fieldErrors?.location}
					<p id="review-request-location-error" class="mt-2 text-sm text-red-700">
						{form.fieldErrors.location}
					</p>
				{/if}
			</div>

			<div>
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<label for="review-request-motivation" class="font-semibold text-slate-800">
						Varför borde vi recensera stället?
					</label>
					<span class="text-sm text-slate-500">Valfritt</span>
				</div>
				<textarea
					id="review-request-motivation"
					name="motivation"
					rows="5"
					maxlength="1000"
					aria-invalid={form?.fieldErrors?.motivation ? 'true' : undefined}
					aria-describedby={form?.fieldErrors?.motivation
						? 'review-request-motivation-error'
						: 'review-request-motivation-help'}
					class="mt-2 w-full resize-y rounded-2xl border border-white/90 bg-white/85 px-4 py-3 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-100"
					>{form?.values?.motivation ?? ''}</textarea
				>
				{#if form?.fieldErrors?.motivation}
					<p id="review-request-motivation-error" class="mt-2 text-sm text-red-700">
						{form.fieldErrors.motivation}
					</p>
				{:else}
					<p id="review-request-motivation-help" class="mt-2 text-sm text-slate-500">
						Högst 1 000 tecken.
					</p>
				{/if}
			</div>

			<button
				type="submit"
				disabled={submitting}
				class="inline-flex min-h-12 w-full touch-manipulation items-center justify-center rounded-full border border-white/90 bg-white/85 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:self-start"
			>
				{submitting ? 'Skickar…' : 'Skicka önskemål'}
			</button>
		</form>
	</section>
</div>
