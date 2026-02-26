<script lang="ts">
	import defaultImage from '$lib/images/image.png';

	interface Props {
		title: string;
		description: string;
		rating: number;
		image?: string;
		location: string;
		author?: string;
		coAuthors?: string;
	}

	let {
		title,
		description,
		rating,
		image = defaultImage,
		location,
		author,
		coAuthors
	}: Props = $props();
</script>

<div
	class="group h-full overflow-hidden rounded-3xl border border-black/10 bg-white/80 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.5)]"
>
	<div class="relative">
		<img
			class="h-44 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
			src={image}
			alt={title}
		/>
		<span
			class="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-[var(--color-ember)] text-sm font-semibold text-white shadow-lg"
		>
			{rating}
		</span>
	</div>
	<div class="space-y-2 px-5 pb-5 pt-4">
		<div class="space-y-1">
			<h2 class="text-xl font-semibold text-[var(--color-char)]">{title}</h2>
			<p class="text-sm uppercase tracking-[0.2em] text-[var(--color-moss)]">{location}</p>
			{#if author}
				<p class="text-xs text-[color:var(--color-char)]/70">
					by {author}{coAuthors ? ` & ${coAuthors}` : ''}
				</p>
			{/if}
		</div>
		<p class="text-sm leading-relaxed text-[color:var(--color-char)]/80">
			{description}
		</p>
	</div>
</div>
