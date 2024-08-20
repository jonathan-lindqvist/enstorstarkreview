<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import { descriptionTemplate } from './constants';
	export let form: ActionData;
</script>

<h1 class="mt-4">Review</h1>

<form action="?/review" method="post" class="flex flex-col gap-4 mt-4 mb-10" use:enhance>
	<div class="flex flex-col">
		<label for="title">Title</label>
		<input type="text" name="title" id="title" class="text-black" />
	</div>

	<div class="flex flex-col">
		<label for="description">Description</label>
		<textarea
			rows="9"
			name="description"
			id="description"
			value={descriptionTemplate}
			class="text-black"
		/>
	</div>

	<div class="flex flex-col w-11">
		<label for="rating">Rating</label>
		<input type="number" min="0" max="3" value="0" name="rating" id="rating" class="text-black" />
	</div>

	<div class="flex flex-col">
		<label for="imagePath">Image path</label>
		<input type="text" name="imagePath" id="imagePath" class="text-black" />
	</div>

	<div class="flex flex-col">
		<label for="location">Location</label>
		<input type="text" name="location" id="location" class="text-black" />
	</div>

	<div class="flex flex-col">
		<label for="slug">URL slug</label>
		<input type="text" name="slug" id="slug" class="text-black" />
	</div>

	{#if form?.message}
		<p class="text-red-600">{form?.message}</p>
	{/if}

	{#if form?.status === 200}
		<p class="text-green-600">{form?.body.message}</p>
	{/if}

	<div class="flex flex-col">
		<button type="submit" class="bg-blue-500 py-2 px-4 rounded">Save review</button>
	</div>
</form>
