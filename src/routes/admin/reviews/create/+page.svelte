<script lang="ts">
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { PageData } from './$types';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<svelte:head>
	<title>Skapa utkast</title>
</svelte:head>

<div class="page-shell">
	<div>
		<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">Skapa utkast</h1>
		<p class="mt-2 max-w-prose text-slate-600">
			Fånga atmosfären, serveringen och helhetsupplevelsen. Utkastet är privat tills det publiceras.
		</p>
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
			mode="create"
			fieldError={form?.pointer}
			fieldMessage={form?.message}
			availableUsers={data.availableUsers}
			currentUsername={data.username}
			previousFormData={actionDataToReviewFormData(form)}
			priceComparison={data.priceComparison}
		/>
	</div>
</div>
