<script lang="ts">
	import type { ReviewPublicationStatus } from '$lib/types/bar-review';
	import { getReviewPublicationBadge } from '$lib/utils/publication';

	interface Props {
		status?: ReviewPublicationStatus;
	}

	let { status }: Props = $props();
	const badge = $derived(getReviewPublicationBadge(status));
</script>

<span
	data-publication-status={status ?? 'published'}
	class={[
		'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] shadow-sm',
		badge.tone === 'amber'
			? 'border-amber-300/80 bg-amber-100 text-amber-900'
			: 'border-emerald-300/80 bg-emerald-100 text-emerald-900'
	]}
>
	{badge.label}
</span>
