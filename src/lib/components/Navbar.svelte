<script>
	import { page } from '$app/state';
	import logo from '$lib/images/logo.webp';
	import github from '$lib/images/github.svg';
</script>

<nav class="sticky top-0 z-30 border-b border-black/10 bg-white/80 backdrop-blur px-3 sm:px-6">
	<div class="mx-auto flex max-w-6xl items-center justify-between py-2 sm:py-3">
		<a href="/" class="flex items-center gap-2">
			<span class="grid place-items-center rounded-full bg-[var(--color-ember)]/15 p-2">
				<img src={logo} alt="Home button" class="h-6 w-6 object-contain" />
			</span>
			<span class="text-sm font-semibold tracking-wide text-[var(--color-char)] sm:text-base">
				Stora Starka
			</span>
		</a>
		<div class="flex flex-1 justify-center px-2">
			<ul
				class="flex flex-wrap items-center justify-center gap-1 rounded-full border border-black/10 bg-white/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-char)] sm:gap-3 sm:px-4 sm:text-xs"
			>
				<li
					aria-current={page.url.pathname === '/' ? 'page' : undefined}
					class={page.url.pathname === '/' ? 'text-[var(--color-ember)]' : undefined}
				>
					<a
						href="/"
						class="rounded-full px-3 py-1 transition-colors duration-200 ease-linear hover:text-[var(--color-ember)]"
						>Home</a
					>
				</li>
				<li
					aria-current={page.url.pathname === '/about' ? 'page' : undefined}
					class={page.url.pathname === '/about' ? 'text-[var(--color-ember)]' : undefined}
				>
					<a
						href="/about"
						class="rounded-full px-3 py-1 transition-colors duration-200 ease-linear hover:text-[var(--color-ember)]"
						>About</a
					>
				</li>
				{#if page.data?.user}
					<li
						aria-current={page.url.pathname === '/admin/reviews/create' ? 'page' : undefined}
						class={page.url.pathname === '/admin/reviews/create'
							? 'text-[var(--color-ember)]'
							: undefined}
					>
						<a
							href="/admin/reviews/create"
							class="rounded-full px-3 py-1 transition-colors duration-200 ease-linear hover:text-[var(--color-ember)]"
							>Create Review</a
						>
					</li>
				{/if}
			</ul>
		</div>
		<a
			href="https://github.com/sveltejs/kit"
			class="grid place-items-center rounded-full border border-black/10 bg-white/80 p-2 transition hover:-translate-y-0.5 hover:text-[var(--color-ember)]"
		>
			<img src={github} alt="GitHub" class="h-5 w-5 object-contain" />
		</a>
	</div>
</nav>
