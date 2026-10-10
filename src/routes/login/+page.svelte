<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let error = $derived(form);
</script>

<svelte:head>
	<title>Logga in</title>
</svelte:head>

<div class="flex min-h-[calc(100vh-56px)] items-center justify-center page-container py-8">
	<div class="glass-panel w-full max-w-md p-6 sm:p-8">
		<h1 class="text-3xl font-semibold text-slate-900">Logga in</h1>
		<p class="mt-2 text-slate-600">För redaktörer som skriver och publicerar recensioner.</p>

		<form action="?/login" method="post" class="mt-6 flex flex-col gap-5" use:enhance>
			{#if error?.message}
				<p class="field-error" role="alert">{error?.message}</p>
			{/if}

			<div>
				<label for="username" class="field-label">Användarnamn</label>
				<input
					type="text"
					name="username"
					id="username"
					autocomplete="username"
					required
					class="field mt-2"
				/>
			</div>

			<div>
				<label for="password" class="field-label">Lösenord</label>
				<input
					type="password"
					name="password"
					id="password"
					autocomplete="current-password"
					required
					class="field mt-2"
				/>
			</div>

			<button type="submit" class="btn btn-primary mt-1 w-full">Logga in</button>
		</form>
	</div>
</div>
