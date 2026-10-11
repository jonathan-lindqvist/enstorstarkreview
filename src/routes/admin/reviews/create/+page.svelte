<script lang="ts">
	import { resolve } from '$app/paths';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import ReviewWizard from '$lib/components/ReviewWizard.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { PageData } from './$types';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();

	const createPath = resolve('/admin/reviews/create');
</script>

<svelte:head>
	<title>Skapa utkast</title>
</svelte:head>

{#snippet formMessage(extraClass: string)}
	{#if form?.message}
		<div
			class="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 {extraClass}"
			role="alert"
		>
			{form.message}
		</div>
	{/if}
{/snippet}

<div class="page-shell">
	{#if data.variant === 'wizard'}
		<h1 class="sr-only">Skapa utkast</h1>
		<p class="mx-auto mb-4 max-w-xl text-sm text-slate-600">
			Du använder wizarden (beta).
			<a href="{createPath}?formular=standard" class="font-medium underline underline-offset-4">
				Byt till standardformuläret
			</a>
		</p>

		{@render formMessage('mx-auto mb-6 max-w-xl')}

		<ReviewWizard
			mode="create"
			fieldError={form?.pointer}
			fieldMessage={form?.message}
			availableUsers={data.availableUsers}
			currentUsername={data.username}
			previousFormData={actionDataToReviewFormData(form)}
			priceComparison={data.priceComparison}
		/>
	{:else}
		<div>
			<h1 class="text-balance text-3xl font-semibold text-slate-900 sm:text-4xl">Skapa utkast</h1>
			<p class="mt-2 max-w-prose text-slate-600">
				Fånga atmosfären, serveringen och helhetsupplevelsen. Utkastet är privat tills det
				publiceras.
			</p>
		</div>

		{#if data.variant === 'standard'}
			<p class="mt-4 text-sm text-slate-600">
				<a href="{createPath}?formular=wizard" class="font-medium underline underline-offset-4">
					Prova wizarden (beta)
				</a>
				som går igenom recensionen steg för steg.
			</p>

			{@render formMessage('mt-6')}

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
		{:else}
			<nav aria-label="Välj formulär" class="mt-8 flex flex-col gap-3 sm:flex-row">
				<a href="{createPath}?formular=standard" class="btn btn-primary min-h-12 sm:min-w-48">
					Standard
				</a>
				<a href="{createPath}?formular=wizard" class="btn btn-secondary min-h-12 sm:min-w-48">
					Wizard (Beta)
				</a>
			</nav>
		{/if}
	{/if}
</div>
