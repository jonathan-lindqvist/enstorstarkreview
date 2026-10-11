<script lang="ts">
	import { BAR_ATTRIBUTES } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';

	let { attributes = $bindable() }: { attributes: BarAttributeKey[] } = $props();
</script>

<fieldset class="mt-6" aria-describedby="attributes-help">
	<legend class="field-label mb-3"> Aktiviteter och utbud </legend>
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
					class="chip chip-off peer-checked:border-amber-700 peer-checked:bg-amber-700 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-500"
				>
					{attribute.label}
				</span>
			</label>
		{/each}
	</div>
	<p id="attributes-help" class="field-help mt-2">
		Välj det som finns på baren. Alla val är frivilliga.
	</p>
</fieldset>
