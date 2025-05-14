<script lang="ts">
	import type { PageProps } from "../$types";
	import defaultImage from '$lib/images/image.png';

	let { data }: PageProps = $props();
</script>

<div class="text-white container mx-auto">
	<h1>Welcome to admin: {data.username}</h1>

	<div class="max-w-[500px] mx-auto">
		<div class="flex justify-between items-center">
			<h1 class="text-2xl underline">Reviews</h1>
			<a href="/admin/review/create" class="text-white bg-orange-600 py-2 px-6 rounded">Create</a>
		</div>
		<ul class="space-y-4 mt-4">
			{#each data.bars as bar}
				<li class="flex bg-gray-800 py-2 px-6 rounded-lg items-center gap-4">
					<img src={bar.image ?? defaultImage} alt={bar.title} class="rounded-full h-20">
					<div>
						<h2 class="text-lg">{bar.title}</h2>
					</div>
					<div class="ml-auto">
						<a href="/admin/review/edit/{bar.slug}" class="text-white bg-orange-600 py-2 px-6 rounded block">Edit</a>
					</div>
				</li>
			{/each}
		</ul>
	</div>
</div>
