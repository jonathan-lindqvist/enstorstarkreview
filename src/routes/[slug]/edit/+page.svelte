<script lang="ts">
	import type { PageData } from './$types';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
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
		previousFormData={form && form.barName !== undefined
			? {
					barName: form.barName ?? '',
					description: form.description ?? '',
					address: form.address ?? '',
					slug: form.slug ?? '',
					coAuthors: Array.isArray(form.coAuthors) ? form.coAuthors : [],
					atmosphere: form.atmosphere ?? 0,
					service: form.service ?? 0,
					selection: form.selection ?? 0,
					quality: form.quality ?? 0,
					price: form.price ?? 0,
					cleanliness: form.cleanliness ?? 0,
					soundLevel: form.soundLevel ?? 0,
					barhopPotential: form.barhopPotential ?? 0,
					rating: form.rating ?? 0
				}
			: null}
	/>
</div>
