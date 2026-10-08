<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
</script>

<!-- Deliberately quiet: a hairline and one small row that marks the end of the page. -->
<footer class="mt-6 border-t border-slate-200">
	<div
		class="page-container flex flex-col gap-3 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
	>
		<div class="min-w-0">
			<p class="flex items-center gap-2 font-semibold text-slate-600">
				<img src="/logo.png" alt="" class="size-5 shrink-0 object-contain opacity-80" />
				En Stor Stark Review
			</p>
			<p class="mt-1.5 leading-relaxed">
				En oberoende guide till barer i Göteborg. Vi betygsätter helhetsupplevelsen och håller koll
				på vad en stor stark faktiskt kostar.
			</p>
		</div>

		<!-- Jumps straight to the review-request form on the FAQ page. -->
		<a
			href={resolve('/about#onska-bar')}
			class="-my-3 inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start font-semibold text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline sm:self-center"
		>
			Önska en bar
			<ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
		</a>
	</div>
</footer>
