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
			<a href="/admin/reviews/create" class="text-white bg-orange-600 py-2 px-6 rounded">Create</a>
		</div>
		<ul class="space-y-4 mt-4">
			{#each data.bars as bar}
				<li class="flex bg-gray-800 py-2 px-6 rounded-lg items-center gap-4">
					<div class="h-20 w-20">
						<img src={bar.image ? `/images/${bar.image}` : undefined} alt={bar.title} class="h-full w-full object-contain">
					</div>
					<div>
						<h2 class="text-lg">{bar.title}</h2>
					</div>
					<div class="ml-auto">
						<a href="/admin/reviews/edit/{bar.slug}" class="text-white bg-orange-600 py-2 px-6 rounded block">Edit</a>
					</div>
				</li>
			{/each}
		</ul>
	</div>
</div>
