<script lang="ts">
	import ReviewWizard from '$lib/components/ReviewWizard.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { PageData } from './$types';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<svelte:head>
	<title>Skapa utkast</title>
</svelte:head>

<div class="page-shell">
	<h1 class="sr-only">Skapa utkast</h1>

	{#if form?.message}
		<div
			class="mx-auto mb-6 max-w-xl rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</div>
	{/if}

	<ReviewWizard
		mode="create"
		fieldError={form?.pointer}
		fieldMessage={form?.message}
		availableUsers={data.availableUsers}
		currentUsername={data.username}
		previousFormData={actionDataToReviewFormData(form)}
		priceComparison={data.priceComparison}
	/>
</div>
