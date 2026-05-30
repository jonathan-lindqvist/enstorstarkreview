<script lang="ts">
	import type { PageData } from './$types';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<div class="container mx-auto px-4 py-4">
	<h1 class="text-2xl mb-4 font-semibold text-slate-900">Redigera recension</h1>

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
