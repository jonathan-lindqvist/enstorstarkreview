<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Card from '../Card.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';

	interface Props {
		selectableAuthors: string[];
		authors: string[];
		currentUsername: string;
		problems: Record<string, string>;
		isDraft: boolean;
		preview: {
			title: string;
			description: string;
			rating: number;
			image: string;
			imageFocusX: number;
			imageFocusY: number;
			location: string;
			beerBrand: string;
			beerPriceKr: number | undefined;
			isHappyHourPrice: boolean;
			attributes: BarAttributeKey[];
		};
	}

	let {
		selectableAuthors,
		authors = $bindable(),
		currentUsername,
		problems,
		isDraft,
		preview
	}: Props = $props();

	const error = $derived(problems['/authors']);
	const selected = $derived(selectableAuthors.filter((name) => authors.includes(name)));
	const credit = $derived(
		selected.length > 1
			? `${selected.slice(0, -1).join(', ')} och ${selected.at(-1)}`
			: (selected[0] ?? '')
	);
</script>

<div class="space-y-8">
	<div>
		<h2 class="wizard-heading" tabindex="-1">Vilka var där?</h2>
		<p class="mt-1 text-slate-600">Alla som du väljer står som författare.</p>
	</div>

	<fieldset
		id="authors-section"
		tabindex="-1"
		aria-describedby="authors-help{error ? ' authors-error' : ''}"
	>
		<legend class="field-label mb-3">Författare</legend>
		<div class="flex flex-wrap gap-x-2 gap-y-3">
			{#each selectableAuthors as username (username)}
				{@const isOn = authors.includes(username)}
				<label class="relative flex w-20 cursor-pointer flex-col items-center gap-1.5 py-1">
					<input
						type="checkbox"
						name="authors"
						value={username}
						bind:group={authors}
						aria-invalid={error ? true : undefined}
						class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
					/>
					<span
						class="relative flex size-14 items-center justify-center rounded-full text-xl font-semibold uppercase ring-offset-2 ring-offset-transparent transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-sky-500 {isOn
							? 'bg-amber-700 text-white ring-2 ring-amber-700'
							: 'bg-slate-900/8 text-slate-500'}"
						aria-hidden="true"
					>
						{username.slice(0, 1)}
						{#if isOn}
							<span
								class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-amber-100 text-amber-900"
							>
								<Check class="size-3.5" strokeWidth={3} />
							</span>
						{/if}
					</span>
					<span
						class="w-full truncate text-center text-sm {isOn
							? 'font-semibold text-slate-900'
							: 'text-slate-600'}"
					>
						{username}
					</span>
					{#if username === currentUsername}
						<span class="-mt-1 text-xs text-slate-500" aria-hidden="true">du</span>
					{/if}
				</label>
			{/each}
		</div>
		<p id="authors-help" class="field-help mt-3">
			{selected.length
				? `${credit} står som författare.`
				: 'Välj minst en person som bidrog. Du kan avmarkera dig själv.'}
		</p>
		{#if error}
			<p id="authors-error" class="field-error mt-2">{error}</p>
		{/if}
	</fieldset>

	<!-- A picture of the form's own values, so assistive technology skips it. -->
	<section aria-hidden="true">
		<div class="mb-3 flex items-baseline justify-between gap-3">
			<h3 class="field-label">Så ser den ut i flödet</h3>
			{#if isDraft}
				<span class="text-xs text-slate-500">Bara inloggade ser utkast</span>
			{/if}
		</div>
		<div
			class="pointer-events-none mx-auto grid max-w-xs select-none"
			data-testid="card-preview"
			inert
		>
			<Card
				title={preview.title || 'Barens namn'}
				description={preview.description}
				rating={preview.rating}
				image={preview.image || undefined}
				imageFocusX={preview.imageFocusX}
				imageFocusY={preview.imageFocusY}
				location={preview.location}
				beerBrand={preview.beerBrand}
				beerPriceKr={preview.beerPriceKr}
				isHappyHourPrice={preview.isHappyHourPrice}
				attributes={preview.attributes}
			/>
		</div>
	</section>
</div>
