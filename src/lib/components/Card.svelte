<script lang="ts">
	import defaultImage from '$lib/images/image.png';
	import { formatAuthorList, formatAuthors } from '$lib/utils/authors';

	interface Props {
		title: string;
		description: string;
		rating: number;
		image?: string;
		location: string;
		author?: string;
		coAuthors?: string[] | string;
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

	const coAuthorsDisplay = $derived.by(() => {
		return formatAuthorList(coAuthors);
	});
</script>

<div
	class="group h-full overflow-hidden rounded-3xl border border-white/90 bg-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl transition duration-300 hover:bg-white/82"
>
	<div class="relative h-32 overflow-hidden sm:h-36">
		<div
			class="h-full w-full bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
			style={`background-image: url('${resolvedImage}')`}
			role="img"
			aria-label={title}
		></div>
		<div class="absolute inset-0 bg-gradient-to-t from-white/55 via-white/18 to-white/8"></div>
	</div>
	<div class="space-y-3 px-5 pb-5 pt-4">
		<div class="space-y-1">
			<div class="flex items-start justify-between gap-4">
				<h2 class="text-xl font-semibold text-slate-900">{title}</h2>
				<div class="rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-slate-700">
					<span class="text-lg font-semibold leading-none">{rating}</span>
					<span class="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
						>/3</span
					>
				</div>
			</div>
			<p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">{location}</p>
			{#if author}
				<p class="text-xs text-slate-600">
					av {formatAuthors(author)}{coAuthorsDisplay ? ` & ${coAuthorsDisplay}` : ''}
				</p>
			{/if}
		</div>
		<p class="text-sm leading-relaxed text-slate-700">
			{description}
		</p>
	</div>
</div>
