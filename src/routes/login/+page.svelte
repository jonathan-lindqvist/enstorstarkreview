<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	export let form: ActionData;

	let error = form;
	$: error = form;
</script>

<h1 class="mt-4">Login</h1>

<form action="?/login" method="post" class="flex flex-col gap-4 mt-4" use:enhance>
	{#if error?.message}
		<p class="text-red-600">{error?.message}</p>
	{/if}
	<div>
		<label for="username">Username:</label>
		<input type="text" name="username" id="username" class="text-black" />
	</div>

	<div>
		<label for="password">Password:</label>
		<input type="password" name="password" id="password" class="text-black" />
	</div>

	<div>
		<button type="submit" class="bg-blue-500 py-2 px-4 rounded">Login</button>
	</div>
</form>
