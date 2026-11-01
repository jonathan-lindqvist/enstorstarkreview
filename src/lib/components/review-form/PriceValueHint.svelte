<script lang="ts">
	import type { PriceValueSuggestion } from '$lib/utils/price-value';

	interface Props {
		suggestion: PriceValueSuggestion;
		class?: string;
	}

	let { suggestion, class: className = '' }: Props = $props();
	const krPerCl = $derived(
		suggestion.krPerCl.toLocaleString('sv-SE', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})
	);
</script>

<p class="text-sm text-slate-600 {className}" aria-live="polite" data-testid="price-value-hint">
	Statistiken säger <strong class="font-semibold text-slate-900">{suggestion.rating}</strong>
	vid {krPerCl} kr/cl{suggestion.assumedVolume ? ' (antar 40 cl)' : ''}.
</p>
