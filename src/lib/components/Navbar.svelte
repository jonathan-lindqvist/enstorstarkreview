<script lang="ts">
	import { page } from '$app/state';
	import House from '@lucide/svelte/icons/house';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Plus from '@lucide/svelte/icons/plus';

	const links = $derived([
		{ href: '/', label: 'Hem', icon: House },
		{ href: '/about', label: 'FAQ', icon: CircleHelp },
		...(page.data?.user
			? [{ href: '/admin/reviews/create', label: 'Skapa utkast', icon: Plus }]
			: [])
	]);

	const REST =
		'border-white/70 bg-white/55 text-slate-600 hover:border-white hover:bg-white/90 hover:text-slate-900';
	const ACTIVE = 'border-white bg-white text-slate-900';
</script>

<nav
	class="sticky top-0 z-30 border-b border-white/60 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl px-3 sm:px-6"
>
	<div
		class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 sm:flex-nowrap sm:gap-x-8 sm:py-2.5"
	>
		<a href="/" class="flex min-w-0 items-center gap-2.5">
			<img
				src="/logo.png"
				alt="Hemknapp"
				class="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
			/>
			<span class="text-sm font-semibold tracking-wide text-slate-900 sm:text-base">
				En Stor Stark Review
			</span>
		</a>
		<ul
			class="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] sm:gap-2 sm:text-xs"
		>
			{#each links as link (link.href)}
				{@const active = page.url.pathname === link.href}
				{@const Icon = link.icon}
				<li>
					<a
						href={link.href}
						aria-current={active ? 'page' : undefined}
						class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-colors duration-200 ease-linear sm:px-3.5 sm:py-1.5 {active
							? ACTIVE
							: REST}"
					>
						<Icon size={14} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
						<span class="sr-only sm:not-sr-only">{link.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</nav>
