<script lang="ts">
	import Search from '@lucide/svelte/icons/search';

	interface Props {
		value?: string;
		onSearch?: (value: string) => void;
	}

	let { value = '', onSearch = () => {} }: Props = $props();

	let inputValue = $state('');
	let searchInput: HTMLInputElement | null = null;

	$effect(() => {
		inputValue = value;
	});

	const syncSearch = (nextValue: string) => {
		inputValue = nextValue;
		onSearch(nextValue);
	};

	const handleInput = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		syncSearch(target.value);
	};

	const handleFormSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		onSearch(inputValue);
		searchInput?.focus({ preventScroll: true });
	};
</script>

<form class="flex w-full" method="get" onsubmit={handleFormSubmit}>
	<div class="relative w-full">
		<Search
			size={20}
			strokeWidth={1.5}
			class="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-500"
			aria-hidden="true"
		/>
		<input
			name="search"
			id="search"
			type="text"
			bind:this={searchInput}
			value={inputValue}
			oninput={handleInput}
			placeholder="Sök bar, stadsdel eller känsla"
			class="h-11 w-full rounded-2xl border border-white/95 bg-white/90 pl-11 pr-4 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none backdrop-blur-md focus:ring-2 focus:ring-sky-200"
		/>
	</div>
</form>
