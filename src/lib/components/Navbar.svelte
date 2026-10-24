<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import House from '@lucide/svelte/icons/house';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import ChartBar from '@lucide/svelte/icons/chart-line';
	import Map from '@lucide/svelte/icons/map';
	import Plus from '@lucide/svelte/icons/plus';
	import Settings from '@lucide/svelte/icons/settings';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';

	const places = [
		{ href: '/', label: 'Hem', icon: House },
		{ href: '/karta', label: 'Karta', icon: Map },
		{ href: '/statistik', label: 'Statistik', icon: ChartBar },
		{ href: '/about', label: 'FAQ', icon: CircleHelp },
		{ href: '/installningar', label: 'Inställningar', icon: Settings }
	] as const;
	const createLink = { href: '/admin/reviews/create', label: 'Skapa utkast', icon: Plus } as const;
	const links = $derived(page.data?.user ? [...places, createLink] : places);

	const FOCUS_RING =
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
	const GLASS_BUTTON = `border shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_85%,transparent)] transition-colors duration-150 ease-out ${FOCUS_RING}`;
	const REST =
		'border-white/70 bg-white/55 text-slate-600 hover:border-white hover:bg-white/90 hover:text-slate-900';
	const ACTIVE = 'border-white bg-white text-slate-900';

	let menu = $state<HTMLDialogElement>();
	let menuOpen = $state(false);

	// The phone menu is a modal <dialog> opened declaratively (`commandfor`). It closes itself on
	// client-side navigation and when the viewport grows into the desktop layout, where the dialog
	// is hidden by CSS but would otherwise stay open (and keep the page inert).
	onMount(() => {
		const desktop = window.matchMedia('(min-width: 64rem)');
		const closeOnDesktop = () => {
			if (desktop.matches) menu?.close();
		};
		desktop.addEventListener('change', closeOnDesktop);
		return () => {
			desktop.removeEventListener('change', closeOnDesktop);
		};
	});

	afterNavigate(() => menu?.close());

	// Fallback for browsers without invoker commands; a no-op where `command` already opened it.
	function openMenu() {
		if (menu && !menu.open) menu.showModal();
	}

	// Tap-outside is handled here rather than with `closedby="any"`: native light dismiss closes the
	// dialog as the finger lifts, so on touch screens the follow-up click lands on the page below.
	// Closing inside the click itself means the backdrop consumes that click.
	function closeOnBackdropTap(event: MouseEvent) {
		if (!menu || event.target !== menu) return;
		const box = menu.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;
		if (!inside) menu.close();
	}
</script>

<header
	class="sticky top-0 z-30 shrink-0 border-b border-white/60 bg-white/65 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_90%,transparent)] backdrop-blur-xl"
>
	<nav aria-label="Huvudmeny" class="page-container flex h-16 items-center gap-3 lg:gap-6">
		<a href={resolve('/')} class="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl {FOCUS_RING}">
			<img
				src="/logo-128.webp"
				width="128"
				height="128"
				alt=""
				class="size-10 shrink-0 object-contain"
			/>
			<span class="truncate text-base font-semibold tracking-wide text-slate-900">
				En Stor Stark Review
			</span>
		</a>

		<!-- Wide screens: every destination stays visible as a labelled pill. -->
		<ul class="hidden shrink-0 items-center gap-1.5 text-sm font-semibold lg:flex">
			{#each links as link (link.href)}
				{@const active = page.url.pathname === link.href}
				{@const Icon = link.icon}
				<li>
					<a
						href={resolve(link.href)}
						aria-current={active ? 'page' : undefined}
						class="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 {GLASS_BUTTON} {active
							? ACTIVE
							: REST}"
					>
						<Icon size={15} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
						{link.label}
					</a>
				</li>
			{/each}
		</ul>

		<div class="flex shrink-0 items-center lg:hidden">
			<button
				type="button"
				commandfor="site-menu"
				command="show-modal"
				onclick={openMenu}
				aria-controls="site-menu"
				aria-expanded={menuOpen}
				aria-label="Meny"
				class="inline-flex size-11 cursor-pointer items-center justify-center rounded-full lg:hidden {GLASS_BUTTON} {menuOpen
					? ACTIVE
					: REST}"
			>
				{#if menuOpen}
					<X size={20} strokeWidth={1.75} aria-hidden="true" />
				{:else}
					<Menu size={20} strokeWidth={1.75} aria-hidden="true" />
				{/if}
			</button>
		</div>

		<!-- Narrow screens: a modal dialog listing the same destinations as the wide-screen pills. -->
		<dialog
			id="site-menu"
			closedby="closerequest"
			aria-label="Meny"
			bind:this={menu}
			ontoggle={(event) => (menuOpen = (event as ToggleEvent).newState === 'open')}
			onclose={() => (menuOpen = false)}
			onclick={closeOnBackdropTap}
			class="fixed inset-x-3 top-[4.25rem] overscroll-contain bottom-auto m-0 max-h-[calc(100dvh-5rem)] w-auto max-w-none origin-top-right overflow-y-auto rounded-3xl border border-white/90 bg-white/90 p-2 text-slate-900 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_95%,transparent)] backdrop-blur-2xl transition-[opacity,scale,display,overlay] transition-discrete duration-200 ease-out backdrop:bg-slate-950/20 not-open:scale-95 not-open:opacity-0 starting:open:scale-95 starting:open:opacity-0 motion-reduce:transition-none sm:left-auto sm:right-6 sm:w-96 lg:hidden"
		>
			<ul class="flex flex-col gap-1">
				{#each links as link (link.href)}
					{@const active = page.url.pathname === link.href}
					{@const Icon = link.icon}
					<li>
						<a
							href={resolve(link.href)}
							aria-current={active ? 'page' : undefined}
							class="flex min-h-12 items-center gap-3 rounded-2xl px-4 text-base font-semibold transition-colors duration-150 {FOCUS_RING} {active
								? 'bg-amber-100 text-amber-950'
								: 'text-slate-700 hover:bg-white hover:text-slate-900'}"
						>
							<Icon
								size={20}
								strokeWidth={1.75}
								class={active ? 'text-amber-800' : 'text-slate-500'}
								aria-hidden="true"
							/>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</dialog>
	</nav>
</header>

<style>
	/* Keep the page from scrolling behind the open phone menu. */
	:global(html:has(#site-menu[open])) {
		overflow: hidden;
	}
</style>
