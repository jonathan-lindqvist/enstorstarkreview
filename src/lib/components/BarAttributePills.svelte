<script lang="ts">
	import { getBarAttributeLabels } from '$lib/bar-attributes';
	import type { BarAttributeKey } from '$lib/types/bar-attributes';

	interface Props {
		attributes?: BarAttributeKey[];
		variant?: 'default' | 'photo';
		maxVisible?: number;
	}
	let { attributes = [], variant = 'default', maxVisible = Infinity }: Props = $props();
	const labels = $derived(getBarAttributeLabels(attributes));
	const visibleLabels = $derived(labels.slice(0, maxVisible));
	const hiddenLabels = $derived(labels.slice(maxVisible));
	const pillClass = $derived([
		'rounded-full px-3 py-1 text-xs font-medium',
		variant === 'photo' ? 'bg-black/40 text-on-photo' : 'bg-slate-100 text-slate-700'
	]);
</script>

{#if labels.length}
	<ul aria-label="Aktiviteter och utbud" class="flex flex-wrap gap-2">
		{#each visibleLabels as label (label)}
			<li class={pillClass}>
				{label}
			</li>
		{/each}
		{#if hiddenLabels.length}
			<li class={pillClass} title={hiddenLabels.join(', ')}>
				<span aria-hidden="true">+{hiddenLabels.length}</span>
				<span class="sr-only">Fler aktiviteter: {hiddenLabels.join(', ')}</span>
			</li>
		{/if}
	</ul>
{/if}
