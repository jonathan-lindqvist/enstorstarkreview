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

<div class="mx-auto w-full max-w-3xl px-4 pb-12 pt-6">
	<div
		class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 p-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.6)] sm:p-8"
	>
		<p class="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-moss)]">
			Ny recension
		</p>
		<h1 class="mt-4 text-3xl font-semibold text-[var(--color-char)] sm:text-4xl">
			Skapa recension
		</h1>
		<p class="mt-2 text-sm text-[color:var(--color-char)]/70">
			Fånga atmosfären, serveringen och helhetsupplevelsen.
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
</div>
