<script lang="ts">
	import type { ReviewPublicationStatus } from '$lib/types/bar-review';
	import { getReviewPublicationBadge } from '$lib/utils/publication';

	interface Props {
		status?: ReviewPublicationStatus;
		/** `photo` is a quiet glass label for sitting on top of a review photo. */
		variant?: 'default' | 'photo';
	}

	let { status, variant = 'default' }: Props = $props();
	const badge = $derived(getReviewPublicationBadge(status));
</script>

{#if variant === 'photo'}
	<span
		data-publication-status={status ?? 'published'}
		class="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-on-photo/85 backdrop-blur-md"
	>
		<span
			aria-hidden="true"
			class={['size-1.5 rounded-full', badge.tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400']}
		></span>
		{badge.label}
	</span>
{:else}
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
{/if}
