<script lang="ts">
	import { BAR_ATTRIBUTES } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';

	let { attributes = $bindable() }: { attributes: BarAttributeKey[] } = $props();
</script>

<fieldset class="mt-4" aria-describedby="attributes-help">
	<legend class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
		Aktiviteter och utbud
	</legend>
	<div class="flex flex-wrap gap-2">
		{#each BAR_ATTRIBUTES as attribute (attribute.key)}
			<label class="relative cursor-pointer">
				<input
					type="checkbox"
					name="attributes"
					value={attribute.key}
					bind:group={attributes}
					class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
				/>
				<span
					class="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-500"
				>
					{attribute.label}
				</span>
			</label>
		{/each}
	</div>
	<p id="attributes-help" class="mt-2 text-xs text-slate-500">
		Välj det som finns på baren. Alla val är frivilliga.
	</p>
</fieldset>
