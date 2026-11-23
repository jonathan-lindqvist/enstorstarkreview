<script lang="ts">
	import { formatClPerKr } from '$lib/utils/beer-value';
	import { ASSUMED_BEER_VOLUME_CL, type PriceValueSuggestion } from '$lib/utils/price-value';

	interface Props {
		suggestion: PriceValueSuggestion;
		class?: string;
	}

	let { suggestion, class: className = '' }: Props = $props();
</script>

<p class="text-sm text-slate-600 {className}" aria-live="polite" data-testid="price-value-hint">
	Statistiken säger <strong class="font-semibold text-slate-900">{suggestion.rating}</strong>
	vid {formatClPerKr(suggestion.clPerKr)}{suggestion.assumedVolume
		? ` (antar ${ASSUMED_BEER_VOLUME_CL} cl)`
		: ''}.
</p>
