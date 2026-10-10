<script lang="ts">
	import type { PageData } from './$types';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<svelte:head>
	<title>Redigera {data.bar.title}</title>
</svelte:head>

<div class="page-shell">
	<div>
		<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">
			Redigera {data.bar.title}
		</h1>
		<div class="mt-3"><PublicationBadge status={data.bar.publicationStatus} /></div>
	</div>

	{#if form?.message}
		<div
			class="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
			role="alert"
		>
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
