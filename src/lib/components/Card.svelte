<script lang="ts">
	import defaultImage from '$lib/images/image.png';

	export let title: string;
	export let description: string;
	export let rating: number;
	export let image: string = defaultImage;
	export let location: string;
</script>

<div class="max-w-sm rounded overflow-hidden shadow-lg bg-gray-800">
	<img class="w-full" src={image} alt="Sunset in the mountains" />
	<div class="px-6 py-4 flex w-full justify-between">
		<div>
			<h2 class="font-bold text-xl">{title}</h2>
			<p class="text-base text-gray-400">{location}</p>
		</div>
		<span
			class="bg-gray-700 text-white font-bold text-xl rounded-full w-12 h-12 flex items-center justify-center"
		>
			{rating}
		</span>
	</div>
	<div class="px-6 pb-4">
		<p class="text-gray-300 mt-2">
			{description}
		</p>
	</div>
</div>
