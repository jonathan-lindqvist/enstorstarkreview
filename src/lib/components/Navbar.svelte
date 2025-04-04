<script>
	import { page } from '$app/state';
	import logo from '$lib/images/logo.webp';
	import github from '$lib/images/github.svg';
</script>

<nav class="flex justify-between px-6 bg-primary-gray h-12 items-center">
	<div>
		<a href="/" class="size-8 block">
			<img src={logo} alt="Home button" class="h-full w-full object-contain" />
		</a>
	</div>
	<div class="flex justify-center">
		<svg viewBox="0 0 2 3" aria-hidden="true" class="h-12 w-8 block text-nav-gray">
			<path d="M0,0 L1,2 C1.5,3 1.5,3 2,3 L2,0 Z" fill="currentColor" />
		</svg>
		<ul
			class="flex justify-center items-center bg-nav-gray text-white/70 font-bold gap-4 px-2 uppercase text-sm"
		>
			<li
				aria-current={page.url.pathname === '/' ? 'page' : undefined}
				class="{page.url.pathname === '/'
					? 'before:absolute before:top-0 before:left-[calc(50%-6px)] before:border-6 before:border-transparent before:w-0 before:h-0 before:border-t-6 before:border-t-orange-600'
					: undefined} h-full relative"
			>
				<a
					href="/"
					class="hover:text-orange-600 transition-colors duration-200 ease-linear flex items-center h-full"
					>Home</a
				>
			</li>
			<li
				aria-current={page.url.pathname === '/about' ? 'page' : undefined}
				class="{page.url.pathname === '/about'
					? 'before:absolute before:top-0 before:left-[calc(50%-6px)] before:border-6 before:border-transparent before:w-0 before:h-0 before:border-t-6 before:border-t-orange-600'
					: undefined} h-full relative"
			>
				<a
					href="/about"
					class="hover:text-orange-600 transition-colors duration-200 ease-linear flex items-center h-full"
					>About</a
				>
			</li>
		</ul>
		<svg viewBox="0 0 2 3" aria-hidden="true" class="h-12 w-8 block text-nav-gray">
			<path d="M0,0 L0,3 C0.5,3 0.5,3 1,2 L2,0 Z" fill="currentColor" />
		</svg>
	</div>

	<div>
		<a href="https://github.com/sveltejs/kit" class="size-8 block">
			<img src={github} alt="GitHub" class="h-full w-full object-contain" />
		</a>
	</div>
</nav>
