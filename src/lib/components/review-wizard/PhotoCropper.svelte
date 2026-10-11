<script lang="ts">
	import { clampImageFocus } from '$lib/utils/review-image';

	interface Props {
		src: string;
		focusX: number;
		focusY: number;
	}

	let { src, focusX = $bindable(), focusY = $bindable() }: Props = $props();

	let width = $state(0);
	let height = $state(0);
	let drag: { x: number; y: number; left: number; top: number } | null = null;

	// The feed card shows a square of the photo. The focus point is the share of the free space
	// on each side, like CSS `object-position`, so the square here matches the card.
	const side = $derived(Math.min(width, height));
	const slackX = $derived(width - side);
	const slackY = $derived(height - side);
	const left = $derived((slackX * focusX) / 100);
	const top = $derived((slackY * focusY) / 100);
	const isLandscape = $derived(width >= height);

	function handlePointerDown(event: PointerEvent) {
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = { x: event.clientX, y: event.clientY, left, top };
	}

	function handlePointerMove(event: PointerEvent) {
		if (!drag) return;
		if (slackX > 1) {
			focusX = clampImageFocus(((drag.left + event.clientX - drag.x) / slackX) * 100);
		}
		if (slackY > 1) {
			focusY = clampImageFocus(((drag.top + event.clientY - drag.y) / slackY) * 100);
		}
	}

	function handlePointerUp() {
		drag = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 2;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		focusX = clampImageFocus(focusX + move[0]);
		focusY = clampImageFocus(focusY + move[1]);
	}
</script>

<button
	type="button"
	class="relative mx-auto block max-w-full cursor-grab touch-none overflow-hidden rounded-3xl bg-slate-900 select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500 active:cursor-grabbing"
	aria-label="Bildutsnitt"
	aria-describedby="photo-cropper-help"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onkeydown={handleKeydown}
>
	<span class="block" bind:clientWidth={width} bind:clientHeight={height}>
		<img {src} alt="" class="block max-h-[28rem] w-auto max-w-full" draggable="false" />
	</span>
	{#if side > 0}
		<span
			class="crop-window pointer-events-none absolute rounded-[1.25rem]"
			style={`left: ${left}px; top: ${top}px; width: ${side}px; height: ${side}px`}
		>
			<span class="crop-corner top-1.5 left-1.5 rounded-tl-2xl border-t-4 border-l-4"></span>
			<span class="crop-corner top-1.5 right-1.5 rounded-tr-2xl border-t-4 border-r-4"></span>
			<span class="crop-corner bottom-1.5 left-1.5 rounded-bl-2xl border-b-4 border-l-4"></span>
			<span class="crop-corner right-1.5 bottom-1.5 rounded-br-2xl border-r-4 border-b-4"></span>
		</span>
	{/if}
</button>
<p id="photo-cropper-help" class="field-help mt-3 text-center">
	{#if Math.abs(width - height) < 2}
		Hela bilden blir kortet i flödet.
	{:else}
		{isLandscape ? 'Dra rutan i sidled' : 'Dra rutan uppåt eller nedåt'}, eller använd
		piltangenterna. Det som syns i rutan blir kortet i flödet.
	{/if}
</p>

<style>
	/* The square stays lit; everything outside it is dimmed. */
	.crop-window {
		box-shadow: 0 0 0 100vmax color-mix(in oklab, var(--color-slate-950) 58%, transparent);
	}

	.crop-corner {
		position: absolute;
		width: 2.25rem;
		height: 2.25rem;
		border-color: var(--color-amber-400);
	}
</style>
