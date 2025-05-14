<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let error = $derived(form);
</script>

<div class="flex flex-col items-center lg:h-[calc(100vh-48px)] justify-center">
	<div class="lg:bg-gray-800 py-6 px-6 rounded-sm max-w-96 w-full">
		<h1 class="text-orange-600 text-3xl font-bold text-center">Login</h1>
		
		<form action="?/login" method="post" class="flex flex-col gap-4 mt-4" use:enhance>
			{#if error?.message}
				<p class="text-red-600">{error?.message}</p>
			{/if}
			
			<div>
				<label for="username" class="text-white/70 block text-lg">Username:</label>
				<input type="text" name="username" id="username" class="text-black bg-white rounded-sm py-2 px-2 mt-2 w-full focus:outline-none focus:ring-orange-600 focus:ring-2" />
			</div>
		
			<div>
				<label for="password" class="text-white/70 block text-lg">Password:</label>
				<input type="password" name="password" id="password" class="text-black bg-white rounded-sm py-2 px-2 mt-2 w-full focus:outline-none focus:ring-orange-600 focus:ring-2" />
			</div>
		
			<button type="submit" class="bg-orange-600 py-2 px-4 rounded-sm w-full font-bold text-lg text-white/90 hover:cursor-pointer">Login</button>
		</form>
	</div>
</div>
