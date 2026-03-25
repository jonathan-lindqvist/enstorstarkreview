<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let error = $derived(form);
</script>

<div class="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-8">
	<div
		class="w-full max-w-md rounded-3xl border border-white/90 bg-white/68 px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl"
	>
		<p
			class="text-center text-xs font-semibold uppercase tracking-[0.4em] text-slate-500"
		>
			Välkommen tillbaka
		</p>
		<h1 class="mt-3 text-center text-3xl font-semibold text-slate-900">Logga in</h1>

		<form action="?/login" method="post" class="flex flex-col gap-4 mt-4" use:enhance>
			{#if error?.message}
				<p class="text-red-600">{error?.message}</p>
			{/if}

			<div>
				<label
					for="username"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
					>Användarnamn</label
				>
				<input
					type="text"
					name="username"
					id="username"
					class="mt-2 w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200"
				/>
			</div>

			<div>
				<label
					for="password"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
					>Lösenord</label
				>
				<input
					type="password"
					name="password"
					id="password"
					class="mt-2 w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200"
				/>
			</div>

			<button
				type="submit"
				class="mt-2 inline-flex w-full items-center justify-center rounded-full border border-white/85 bg-white/82 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white hover:cursor-pointer"
				>Logga in</button
			>
		</form>
	</div>
</div>
