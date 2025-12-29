<script lang="ts">
	import type { PageProps } from './$types';
	import ReviewForm from '$lib/components/ReviewForm.svelte';

	let { data }: PageProps = $props();
</script>

<div class="container mx-auto px-4 py-4 text-white">
	<h1 class="text-2xl mb-4">Edit review</h1>

	<ReviewForm mode="edit" bar={data.bar} />
</div>
