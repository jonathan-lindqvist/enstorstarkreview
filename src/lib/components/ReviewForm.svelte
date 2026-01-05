<script lang="ts">
	import { descriptionTemplate } from '$lib/constants';

	export let mode: 'create' | 'edit';
	export let bar: any = null;

	let barName = bar?.title ?? '';
	let description = bar?.description ?? (mode === 'create' ? descriptionTemplate : '');
	let address = bar?.location ?? '';
	let slug = bar?.slug ?? '';

	let atmosphere = bar?.atmosphere ?? 0;
	let service = bar?.service ?? 0;
	let selection = bar?.selection ?? 0;
	let quality = bar?.quality ?? 0;
	let price = bar?.price ?? 0;
	let cleanliness = bar?.cleanliness ?? 0;
	let soundLevel = bar?.soundLevel ?? 0;
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

	<label for="atmosphere" class="mt-4 block">Atmosphere</label>
	<input
		type="number"
		name="atmosphere"
		id="atmosphere"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={atmosphere}
	/>

	<label for="service" class="mt-4 block">Service</label>
	<input
		type="number"
		name="service"
		id="service"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={service}
	/>

	<label for="selection" class="mt-4 block">Selection</label>
	<input
		type="number"
		name="selection"
		id="selection"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={selection}
	/>

	<label for="quality" class="mt-4 block">quality</label>
	<input
		type="number"
		name="quality"
		id="quality"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={quality}
	/>

	<label for="price" class="mt-4 block">Price</label>
	<input
		type="number"
		name="price"
		id="price"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={price}
	/>

	<label for="cleanliness" class="mt-4 block">Cleanliness</label>
	<input
		type="number"
		name="cleanliness"
		id="cleanliness"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={cleanliness}
	/>

	<label for="soundLevel" class="mt-4 block">Sound level</label>
	<input
		type="number"
		name="soundLevel"
		id="soundLevel"
		min="0"
		max="5"
		step="1"
		class="bg-white text-black rounded-md py-2 px-2 w-full mt-1 focus:outline-none focus:ring-orange-600 focus:ring-2"
		bind:value={soundLevel}
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
