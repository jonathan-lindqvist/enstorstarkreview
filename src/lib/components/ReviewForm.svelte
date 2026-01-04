<script lang="ts">
	import { descriptionTemplate } from '$lib/constants';

	export let mode: 'create' | 'edit';
	export let bar: any = null;

	let barName = bar?.title ?? '';
	let description = bar?.description ?? (mode === 'create' ? descriptionTemplate : '');
	let rating = bar?.rating ?? 0;
	let address = bar?.location ?? '';
	let slug = bar?.slug ?? '';
</script>

<form method="post" enctype="multipart/form-data" class="mt-4 bg-gray-800 py-6 px-6 rounded-lg">
	<label for="bar-name" class="block">Name of the bar</label>
	<input
		type="text"
		name="bar-name"
		id="bar-name"
		class="bg-white rounded-md px-2 py-2 mt-1 w-full text-black focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={barName}
	/>

	<label for="description" class="mt-4 block">Description</label>
	<textarea
		name="description"
		id="description"
		rows="9"
		class="bg-white text-black mt-1 w-full rounded-md px-2 py-2 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={description}
	></textarea>

	<label for="rating" class="mt-4 block">Rating</label>
	<input
		type="number"
		name="rating"
		id="rating"
		min="0"
		max="5"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={rating}
	/>

	<label for="image" class="mt-4 block">
		Image {mode === 'edit' ? '(optional)' : ''}
	</label>
	<input
		type="file"
		name="image"
		id="image"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
	/>

	<label for="address" class="mt-4 block">Address</label>
	<input
		type="text"
		name="address"
		id="address"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={address}
	/>

	<label for="slug" class="mt-4 block">URL Slug</label>
	<input
		type="text"
		name="slug"
		id="slug"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={slug}
	/>

	{#if mode === 'edit'}
		<input type="hidden" name="id" value={bar._id} />
	{/if}

	<button
		type="submit"
		class="bg-orange-600 py-2 px-4 rounded-md mt-4 w-full focus:outline-none focus:ring-orange-600 focus:ring-2 hover:cursor-pointer"
	>
		{mode === 'edit' ? 'Update review' : 'Create review'}
	</button>
</form>
