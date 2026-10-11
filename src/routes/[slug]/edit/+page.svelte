<script lang="ts">
	import type { PageData } from './$types';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewWizard from '$lib/components/ReviewWizard.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<svelte:head>
	<title>Redigera {data.bar.title}</title>
</svelte:head>

<div class="page-shell">
	<div class="mx-auto mb-4 flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2">
		<h1 class="text-balance text-lg font-semibold text-slate-900">Redigera {data.bar.title}</h1>
		<PublicationBadge status={data.bar.publicationStatus} />
	</div>

	{#if form?.message}
		<div
			class="mx-auto mb-6 max-w-xl rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</div>
	{/if}

	<!-- A new wizard for each review: its state starts from the review it edits. -->
	{#key data.bar._id}
		<ReviewWizard
			mode="edit"
			bar={data.bar}
			fieldError={form?.pointer}
			fieldMessage={form?.message}
			availableUsers={data.availableUsers}
			currentUsername={data.currentUsername}
			previousFormData={actionDataToReviewFormData(form)}
			priceComparison={data.priceComparison}
		/>
	{/key}
</div>
