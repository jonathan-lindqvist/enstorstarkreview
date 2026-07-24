<script lang="ts">
	import Search from '@lucide/svelte/icons/search';

	interface Props {
		value?: string;
		onInput?: (value: string) => void;
	}

	let { value = '', onInput = () => {} }: Props = $props();

	let inputValue = $state('');

	$effect(() => {
		inputValue = value;
	});

	const handleInput = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		const nextValue = target.value;
		inputValue = nextValue;
		onInput(nextValue);
	};
</script>

<div class="relative w-full">
	<label class="sr-only" for="search">Sök bland recensioner</label>
	<Search
		class="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-slate-500"
		strokeWidth={1.8}
		aria-hidden="true"
	/>
	<input
		name="search"
		id="search"
		type="search"
		value={inputValue}
		oninput={handleInput}
		placeholder="Sök bar, stadsdel eller känsla"
		class="h-11 w-full rounded-2xl border border-white/95 bg-white/90 pl-11 pr-4 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none backdrop-blur-md focus:ring-2 focus:ring-sky-200"
	/>
</div>
