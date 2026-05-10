<script>
	import { page } from '$app/state';
</script>

<nav
	class="sticky top-0 z-30 border-b border-white/60 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl px-3 sm:px-6"
>
	<div class="mx-auto flex max-w-6xl items-center justify-between py-2 sm:py-3">
		<a href="/" class="flex items-center gap-2">
			<span class="grid place-items-center">
				<img src="/logo.png" alt="Hemknapp" class="h-12 w-12 object-contain sm:h-14 sm:w-14" />
			</span>
			<span class="text-sm font-semibold tracking-wide text-slate-900 sm:text-base">
				En Stor Stark Review
			</span>
		</a>
		<div class="flex flex-1 justify-center px-2">
			<ul
				class="flex flex-wrap items-center justify-center gap-1 rounded-full border border-white/80 bg-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 sm:gap-3 sm:px-4 sm:text-xs"
			>
				<li
					aria-current={page.url.pathname === '/' ? 'page' : undefined}
					class={page.url.pathname === '/' ? 'text-slate-900' : undefined}
				>
					<a
						href="/"
						class="rounded-full px-3 py-1 transition-colors duration-200 ease-linear hover:text-slate-900"
						>Hem</a
					>
				</li>
				<li
					aria-current={page.url.pathname === '/about' ? 'page' : undefined}
					class={page.url.pathname === '/about' ? 'text-slate-900' : undefined}
				>
					<a
						href="/about"
						class="rounded-full px-3 py-1 transition-colors duration-200 ease-linear hover:text-slate-900"
						>FAQ</a
					>
				</li>
				{#if page.data?.user}
					<li
						aria-current={page.url.pathname === '/admin/reviews/create' ? 'page' : undefined}
						class={page.url.pathname === '/admin/reviews/create' ? 'text-slate-900' : undefined}
					>
						<a
							href="/admin/reviews/create"
							class="rounded-full px-3 py-1 transition-colors duration-200 ease-linear hover:text-slate-900"
							>Skapa recension</a
						>
					</li>
				{/if}
			</ul>
		</div>
	</div>
</nav>
