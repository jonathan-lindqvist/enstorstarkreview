<script lang="ts">
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import type { PageData } from './$types';
	import type { ReviewFormActionData } from '$lib/types/bar-review';

	let { data, form }: { data: PageData; form: ReviewFormActionData | null } = $props();
</script>

<div class="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
	<div
		class="rounded-3xl border border-white/90 bg-white/68 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Ny recension</p>
		<h1 class="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Skapa recension</h1>
		<p class="mt-2 text-sm text-slate-600">Fånga atmosfären, serveringen och helhetsupplevelsen.</p>
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
</div>
