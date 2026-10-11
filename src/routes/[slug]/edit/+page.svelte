<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import PublicationBadge from '$lib/components/PublicationBadge.svelte';
	import ReviewWizard from '$lib/components/ReviewWizard.svelte';
	import { actionDataToReviewFormData } from '$lib/utils/review-form';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
	let deleteConfirmation = $state<HTMLDetailsElement>();
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

	<!--
		Deleting is kept away from everyday controls: a quiet link at the very bottom of the edit
		page that opens a confirmation. Works without JavaScript; the form posts to the detail page's
		delete action, which owns authorization and auditing.
	-->
	<details
		bind:this={deleteConfirmation}
		class="mx-auto mt-12 max-w-xl border-t border-slate-200/80 pt-4"
	>
		<summary
			class="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-500 underline-offset-4 hover:text-red-700 hover:underline [&::-webkit-details-marker]:hidden"
		>
			<Trash2 class="size-4" aria-hidden="true" />
			Ta bort recensionen
		</summary>
		<div class="mt-2 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
			<p class="font-semibold text-red-900">Ta bort {data.bar.title}?</p>
			<p class="mt-1 max-w-prose text-sm text-red-800">
				Recensionen försvinner från sajten, kartan och statistiken för alla besökare. Den finns kvar
				i databasen men går inte att återställa härifrån.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<form
					method="POST"
					action="{resolve('/[slug]', { slug: encodeURIComponent(data.bar.slug) })}?/delete"
				>
					<button type="submit" class="btn btn-danger">Ja, ta bort</button>
				</form>
				<button
					type="button"
					class="btn btn-secondary"
					onclick={() => deleteConfirmation?.removeAttribute('open')}
				>
					Avbryt
				</button>
			</div>
		</div>
	</details>
</div>
