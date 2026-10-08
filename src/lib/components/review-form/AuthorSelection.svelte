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

<fieldset id="authors-section" class="mt-4" tabindex="-1" aria-describedby="authors-help">
	<legend class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
		Författare
	</legend>
	<div
		class="space-y-2 rounded-2xl border border-white/85 bg-white/85 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-glass-highlight)_85%,transparent)]"
	>
		{#each selectableAuthors as username (username)}
			<label class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition py-2">
				<input
					type="checkbox"
					name="authors"
					value={username}
					bind:group={authors}
					aria-invalid={hasError('authors')}
					aria-describedby={hasError('authors') ? 'authors-error' : undefined}
					class="w-5 h-5 rounded border-white/85 accent-sky-500 cursor-pointer"
				/>
				<span class="text-sm text-slate-700 font-medium flex-1">{username}</span>
			</label>
		{/each}
	</div>
	<p id="authors-help" class="text-xs text-slate-500 mt-2">
		Välj minst en person som bidrog till recensionen. Du kan avmarkera dig själv.
	</p>
	{#if hasError('authors')}
		<p id="authors-error" class="text-red-400 text-xs mt-1">
			{getFieldErrorMessage('authors', 'Välj minst en författare')}
		</p>
	{/if}
</fieldset>
