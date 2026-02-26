<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<div class="text-white/70 container mx-auto mt-3">
	<h1 class="text-4xl text-center">{data.bar.title}</h1>

	<div class="text-sm text-gray-400 text-center mt-2">
		{#if data.bar.author}
			<span>Reviewed by <span class="text-orange-600">{data.bar.author}</span></span>
			{#if data.bar.coAuthors}
				<span> & {data.bar.coAuthors}</span>
			{/if}
		{/if}
		{#if data.bar.createdAt}
			<span class="mx-2">•</span>
			<span>{formatDate(data.bar.createdAt)}</span>
		{/if}
	</div>

	<p class="mt-4">{data.bar.description}</p>

	<p class="mt-2">{data.bar.rating}/5 stars</p>

	<div class="mt-6 flex justify-between items-center">
		<a href="/" class="flex flex-row gap-2 text-orange-600">
			<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
				/>
			</svg>
			Go back
		</a>

		{#if data.user}
			<a href={`/${encodeURIComponent(data.bar.slug)}/edit`}>Edit</a>
		{/if}
	</div>
</div>
