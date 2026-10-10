<script lang="ts">
	import Search from '@lucide/svelte/icons/search';

	interface Props {
		value?: string;
		onSearch?: (value: string) => void;
	}

	let { value = '', onSearch = () => {} }: Props = $props();

	let inputValue = $derived(value);
	let searchInput: HTMLInputElement | null = null;

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

<form class="flex w-full flex-col gap-2" method="get" role="search" onsubmit={handleFormSubmit}>
	<label for="search" class="field-label">Sök</label>
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
			type="search"
			bind:this={searchInput}
			value={inputValue}
			oninput={handleInput}
			placeholder="Bar, stadsdel eller känsla"
			class="field pl-11!"
		/>
	</div>
</form>
