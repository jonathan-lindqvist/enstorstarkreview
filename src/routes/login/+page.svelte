<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let error = $derived(form);
</script>

<div class="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-8">
	<div
		class="w-full max-w-md rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 px-6 py-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.6)]"
	>
		<p
			class="text-center text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-moss)]"
		>
			Välkommen tillbaka
		</p>
		<h1 class="mt-3 text-center text-3xl font-semibold text-[var(--color-char)]">Logga in</h1>

		<form action="?/login" method="post" class="flex flex-col gap-4 mt-4" use:enhance>
			{#if error?.message}
				<p class="text-red-600">{error?.message}</p>
			{/if}

			<div>
				<label
					for="username"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)]"
					>Användarnamn</label
				>
				<input
					type="text"
					name="username"
					id="username"
					class="mt-2 w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)]"
				/>
			</div>

			<div>
				<label
					for="password"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)]"
					>Lösenord</label
				>
				<input
					type="password"
					name="password"
					id="password"
					class="mt-2 w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)]"
				/>
			</div>

			<button
				type="submit"
				class="mt-2 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-ember)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5 hover:cursor-pointer"
				>Logga in</button
			>
		</form>
	</div>
</div>
