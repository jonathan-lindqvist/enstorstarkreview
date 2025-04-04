<script lang="ts">
	import defaultImage from '$lib/images/image.png';

	interface Props {
		title: string;
		description: string;
		rating: number;
		image?: string;
		location: string;
	}

	let { title, description, rating, image = defaultImage, location }: Props = $props();
</script>

<div class="rounded-sm shadow-lg bg-gray-800 h-full px-6 pt-2 pb-4">
	<img class="w-full text-orange-600" src={image} alt="Sunset in the mountains" />
	<div class="flex w-full justify-between">
		<div>
			<h2 class="font-bold text-xl text-orange-600">{title}</h2>
			<p class="text-base text-gray-400">{location}</p>
		</div>
		<span
			class="bg-gray-700 text-white font-bold text-xl rounded-full w-12 h-12 flex items-center justify-center"
		>
			{rating}
		</span>
	</div>
	<p class="text-gray-300 mt-2">
		{description}
	</p>
</div>
