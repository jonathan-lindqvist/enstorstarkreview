<script lang="ts">
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { PageData } from './$types';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<div class="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Nytt utkast</p>
		<h1 class="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Skapa utkast</h1>
		<p class="mt-2 text-sm text-slate-600">
			Fånga atmosfären, serveringen och helhetsupplevelsen. Utkastet är privat tills det publiceras.
		</p>
	</div>

	{#if form?.message}
		<div class="mt-6 rounded-2xl border border-red-400/60 bg-red-100 p-4 text-sm text-red-700">
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
		/>
	</div>
</div>
