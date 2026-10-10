<script lang="ts">
	interface Props {
		hasError: (field: string) => boolean;
		getFieldErrorMessage: (field: string, fallback: string) => string;
		selectableAuthors: string[];
		authors: string[];
	}
	let {
		hasError,
		getFieldErrorMessage,
		selectableAuthors,
		authors = $bindable()
	}: Props = $props();
</script>

<fieldset id="authors-section" class="mt-6" tabindex="-1" aria-describedby="authors-help">
	<legend class="field-label mb-3"> Författare </legend>
	<div class="divide-y divide-slate-200 rounded-2xl border border-slate-300 bg-white px-4">
		{#each selectableAuthors as username (username)}
			<label class="flex min-h-12 cursor-pointer items-center gap-3 py-2">
				<input
					type="checkbox"
					name="authors"
					value={username}
					bind:group={authors}
					aria-invalid={hasError('authors')}
					aria-describedby={hasError('authors') ? 'authors-error' : undefined}
					class="size-5 cursor-pointer rounded accent-amber-700"
				/>
				<span class="text-sm text-slate-700 font-medium flex-1">{username}</span>
			</label>
		{/each}
	</div>
	<p id="authors-help" class="field-help mt-2">
		Välj minst en person som bidrog till recensionen. Du kan avmarkera dig själv.
	</p>
	{#if hasError('authors')}
		<p id="authors-error" class="field-error mt-2">
			{getFieldErrorMessage('authors', 'Välj minst en författare')}
		</p>
	{/if}
</fieldset>
