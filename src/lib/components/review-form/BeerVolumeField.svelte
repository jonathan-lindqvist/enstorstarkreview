<script lang="ts">
	import { MIN_BEER_VOLUME_CL, MAX_BEER_VOLUME_CL } from '#lib/utils/beer-value.js';
	interface Props {
		beerVolumeCl: string | number | undefined;
		error?: string;
	}
	let { beerVolumeCl = $bindable(), error = '' }: Props = $props();
</script>

<div>
	<label for="beer-volume" class="field-label mb-2">Volym (cl)</label>
	<input
		type="number"
		name="beer-volume"
		id="beer-volume"
		min={MIN_BEER_VOLUME_CL}
		max={MAX_BEER_VOLUME_CL}
		step="1"
		inputmode="numeric"
		class="field"
		bind:value={beerVolumeCl}
		aria-invalid={error ? true : undefined}
		aria-describedby={error ? 'beer-volume-error' : 'beer-volume-help'}
	/>
	{#if error}
		<p id="beer-volume-error" class="field-error mt-2">{error}</p>
	{:else}
		<p id="beer-volume-help" class="field-help mt-2">Lämna tomt om du inte vet.</p>
	{/if}
</div>
