<script lang="ts">
	import { getBarAttributeLabels } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';

	let { attributes = [] }: { attributes?: BarAttributeKey[] } = $props();
	const labels = $derived(getBarAttributeLabels(attributes));
</script>

{#if labels.length}
	<ul aria-label="Aktiviteter och utbud" class="flex flex-wrap gap-2">
		{#each labels as label (label)}
			<li
				class="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700"
			>
				{label}
			</li>
		{/each}
	</ul>
{/if}
