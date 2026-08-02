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
</div>
