<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import AttributeSelection from './AttributeSelection.svelte';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';

	interface Props {
		mode: 'create' | 'edit';
		previewUrl: string;
		barName: string;
		address: string;
		slug: string;
		slugEdited: boolean;
		attributes: BarAttributeKey[];
		problems: Record<string, string>;
		onGenerateSlug: () => void;
	}

	let {
		mode,
		previewUrl,
		barName = $bindable(),
		address = $bindable(),
		slug = $bindable(),
		slugEdited = $bindable(),
		attributes = $bindable(),
		problems,
		onGenerateSlug
	}: Props = $props();

	const slugError = $derived(problems['/slug']);
</script>

<div class="space-y-6">
	{#if previewUrl}
		<div class="flex items-center gap-3">
			<span class="relative">
				<img src={previewUrl} alt="" class="size-14 rounded-xl object-cover" />
				<span
					class="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-amber-700 text-white"
				>
					<Check class="size-3.5" strokeWidth={3} aria-hidden="true" />
				</span>
			</span>
			<span class="text-sm font-semibold text-slate-600">Bilden är klar</span>
		</div>
	{/if}

	<h2 class="wizard-heading" tabindex="-1">Var är ni?</h2>

	<div class="space-y-4">
		<div>
			<label for="bar-name" class="field-label mb-2">Barens namn</label>
			<input
				type="text"
				name="bar-name"
				id="bar-name"
				autocomplete="organization"
				class="field min-h-14 text-xl font-semibold"
				aria-invalid={problems['/bar-name'] ? true : undefined}
				aria-describedby={problems['/bar-name'] ? 'bar-name-error' : undefined}
				bind:value={barName}
				required
			/>
			{#if problems['/bar-name']}
				<p id="bar-name-error" class="field-error mt-2">{problems['/bar-name']}</p>
			{/if}
		</div>

		<div>
			<label for="address" class="field-label mb-2">Adress</label>
			<input
				type="text"
				name="address"
				id="address"
				autocomplete="street-address"
				class="field min-h-14 text-lg"
				aria-invalid={problems['/address'] ? true : undefined}
				aria-describedby="address-help{problems['/address'] ? ' address-error' : ''}"
				bind:value={address}
				required
			/>
			<p id="address-help" class="field-help mt-2">
				Skriv gatan, postnumret och orten. Adressen hamnar på kartan när recensionen publiceras.
			</p>
			{#if problems['/address']}
				<p id="address-error" class="field-error mt-2">{problems['/address']}</p>
			{/if}
		</div>
	</div>

	<AttributeSelection bind:attributes />

	{#snippet slugField()}
		<div class="flex flex-col gap-2 sm:flex-row sm:items-start">
			<input
				type="text"
				name="slug"
				id="slug"
				class="field flex-1"
				aria-invalid={slugError ? true : undefined}
				aria-describedby="slug-help{slugError ? ' slug-error' : ''}"
				bind:value={slug}
				oninput={() => (slugEdited = true)}
				required
			/>
			<button type="button" onclick={onGenerateSlug} class="btn btn-secondary min-h-12">
				Skapa från namnet
			</button>
		</div>
		<p id="slug-help" class="field-help mt-2">
			Recensionens adress på webben, till exempel /barens-namn. Svenska tecken (åäö) är tillåtna.
		</p>
		{#if slugError}
			<p id="slug-error" class="field-error mt-2">{slugError}</p>
		{/if}
	{/snippet}

	{#if mode === 'edit'}
		<div>
			<label for="slug" class="field-label mb-2">Länk</label>
			{@render slugField()}
		</div>
	{:else}
		<!-- A new review gets its link from the name; most reviewers never open this. -->
		<details class="group" open={Boolean(slugError)}>
			<summary
				class="cursor-pointer text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
			>
				Länk: <span class="font-normal">/{slug || 'barens-namn'}</span>
			</summary>
			<div class="mt-3">
				<label for="slug" class="field-label mb-2">Länk</label>
				{@render slugField()}
			</div>
		</details>
	{/if}
</div>
