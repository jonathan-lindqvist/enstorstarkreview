<script lang="ts">
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import type { PageData } from './$types';
	import type { BarReviewFormData } from '$lib/types/bar-review';

	interface FormResponse extends Partial<BarReviewFormData> {
		pointer?: string;
		message?: string;
	}

	let { data, form }: { data: PageData; form: FormResponse | null } = $props();
</script>

<div class="container mx-auto px-4 py-4 text-white">
	<h1 class="text-2xl mb-4">Create New Review</h1>

	{#if form?.message}
		<div
			class={`mb-4 p-4 rounded-lg ${form.message.includes('Could') || form.message.includes('Invalid') || form.message.includes('already') ? 'bg-red-900/30 border border-red-600 text-red-200' : 'bg-green-900/30 border border-green-600 text-green-200'}`}
		>
			{form.message}
		</div>
	{/if}

	<ReviewForm
		mode="create"
		fieldError={form?.pointer}
		previousFormData={form && form.barName !== undefined
			? {
					barName: form.barName ?? '',
					description: form.description ?? '',
					address: form.address ?? '',
					slug: form.slug ?? '',
					coAuthors: form.coAuthors ?? '',
					atmosphere: form.atmosphere ?? 0,
					service: form.service ?? 0,
					selection: form.selection ?? 0,
					quality: form.quality ?? 0,
					price: form.price ?? 0,
					cleanliness: form.cleanliness ?? 0,
					soundLevel: form.soundLevel ?? 0
				}
			: null}
	/>
</div>
