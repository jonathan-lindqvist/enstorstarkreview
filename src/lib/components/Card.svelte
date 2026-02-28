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

	const resolvedImage = $derived.by(() => {
		if (!image) return defaultImage;
		if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('/')) {
			return image;
		}
		return `/images/${image}`;
	});
</script>

<div
	class="group h-full overflow-hidden rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.5)]"
>
	<div class="relative h-28 overflow-hidden sm:h-32">
		<div
			class="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
			style={`background-image: url('${resolvedImage}')`}
			role="img"
			aria-label={title}
		></div>
		<div class="absolute inset-0 bg-white/45 backdrop-blur-[1px]"></div>
	</div>
	<div class="space-y-2 px-5 pb-5 pt-4">
		<div class="space-y-1">
			<div class="flex items-start justify-between gap-4">
				<h2 class="text-xl font-semibold text-[var(--color-char)]">{title}</h2>
				<div class="flex items-baseline gap-1 text-[var(--color-char)]">
					<span class="text-3xl font-bold leading-none text-[var(--color-ember)]">{rating}</span>
					<span
						class="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-char)]/60"
						>/5</span
					>
				</div>
			</div>
			<p class="text-sm uppercase tracking-[0.2em] text-[var(--color-moss)]">{location}</p>
			{#if author}
				<p class="text-xs text-[color:var(--color-char)]/70">
					av {author}{coAuthors ? ` & ${coAuthors}` : ''}
				</p>
			{/if}
		</div>
		<p class="text-sm leading-relaxed text-[color:var(--color-char)]/80">
			{description}
		</p>
	</div>
</div>
