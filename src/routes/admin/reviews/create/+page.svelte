<script lang="ts">
	import type { PageProps } from "./$types";
	import { enhance } from "$app/forms";
	import { descriptionTemplate } from '$lib/constants';
	import ArrowLongLeft from "$lib/components/svgs/ArrowLongLeft.svelte";

	let { data, form }: PageProps = $props();

	let barName = $state('')
	let slug = $derived(barName.toLowerCase().replace(/[äÄ]/g, 'a').replace(/[åÅ]/g, 'a').replace(/[öÖ]/g,'a').replace(/\W+/g, '-'))
</script>

<div class="text-white container mx-auto px-4 py-4">
	<h1>Welcome to admin: {data.username}</h1>

	<div class="max-w-[500px] mx-auto">
		<div class="flex justify-between items-center">
			<a href="/admin/reviews" class="text-orange-600 rounded underline flex gap-1 items-center">
				<span>
					<ArrowLongLeft />
				</span>
				Back to reviews
			</a>
			<h1 class="text-2xl underline">Create review</h1>
		</div>

		<form method="post" enctype="multipart/form-data" class="mt-4 bg-gray-800 py-6 px-6 rounded-lg" use:enhance>
			<label for="bar-name" class="block">Name of the bar</label>
			<input type="text" name="bar-name" id="bar-name" class="bg-white rounded-md px-2 py-2 mt-1 w-full text-black focus:outline-none focus:ring-orange-600 focus:ring-2" bind:value={barName}>

			<label for="description" class="mt-4 block">Description</label>
			<textarea 
				name="description" 
				id="description"
				rows="9"
				class="bg-white text-black mt-1 w-full rounded-md px-2 py-2 focus:outline-none focus:ring-orange-600 focus:ring-2"
			>{descriptionTemplate}</textarea>

			<label for="rating" class="mt-4 block">Rating</label>
			<input type="number" name="rating" id="rating" min="0" max="5" value="0" class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2">

			<label for="image" class="mt-4 block">Image</label>
			<input type="file" name="image" id="image" class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2">

			<label for="address" class="mt-4 block">Address</label>
			<input type="text" name="address" id="address" class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2">

			<label for="slug" class="mt-4 block">URL Slug</label>
			<input type="text" name="slug" id="slug" class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2" bind:value={slug}>

			{#if form?.message}
				<p class="text-red-500 mt-4">{form.message}</p>
			{/if}

			{#if form?.success}
				<p class="text-green-600 mt-4">Succefully created review</p>
			{/if}
			
			<button type="submit" class="bg-orange-600 py-2 px-4 rounded-md mt-4 w-full focus:outline-none focus:ring-orange-600 focus:ring-2	hover:cursor-pointer">Create review</button>
		</form>
	</div>
</div>