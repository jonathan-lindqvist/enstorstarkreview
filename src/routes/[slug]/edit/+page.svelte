<script lang="ts">
	import type { PageData } from './$types';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<div class="page-shell">
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_90%,transparent),0_14px_30px_-26px_color-mix(in_oklab,var(--color-glass-shadow)_55%,transparent)] backdrop-blur-xl sm:p-8"
	>
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
				{data.bar.title}
			</p>
			<PublicationBadge status={data.bar.publicationStatus} />
		</div>
		<h1 class="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Redigera recension</h1>
	</div>

	{#if form?.message}
		<div class="mt-6 rounded-2xl border border-red-400/60 bg-red-100 p-4 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<div class="mt-6">
		<ReviewForm
			mode="edit"
			bar={data.bar}
			fieldError={form?.pointer}
			fieldMessage={form?.message}
			availableUsers={data.availableUsers}
			currentUsername={data.currentUsername}
			previousFormData={actionDataToReviewFormData(form)}
			priceComparison={data.priceComparison}
		/>
	</div>
</div>
