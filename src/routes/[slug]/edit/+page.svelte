<script lang="ts">
	import type { PageData } from './$types';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<div class="container mx-auto px-4 py-4">
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold text-slate-900">Redigera recension</h1>
		<PublicationBadge status={data.bar.publicationStatus} />
	</div>

	{#if form?.message}
		<div class="mb-6 rounded-2xl border border-red-400/60 bg-red-100 p-4 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<ReviewForm
		mode="edit"
		bar={data.bar}
		fieldError={form?.pointer}
		fieldMessage={form?.message}
		availableUsers={data.availableUsers}
		currentUsername={data.currentUsername}
		previousFormData={actionDataToReviewFormData(form)}
	/>
</div>
