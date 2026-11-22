<script lang="ts">
	import { serializeJsonLd } from '$lib/seo';

	let { value }: { value: Record<string, unknown> } = $props();
</script>

<svelte:element this={'script'} type="application/ld+json">{serializeJsonLd(value)}</svelte:element>
