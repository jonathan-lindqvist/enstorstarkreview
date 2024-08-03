<script lang="ts">
import defaultImage from '$lib/images/image.png';

  export let title: string;
  export let description: string;
  export let rating: number;
  export let image: string = defaultImage;
  export let location: string;
</script>

<!-- <div class="border-slate-600 border-2 rounded-md flex flex h-1/5">
  <img src={image} alt="bar" class="h-full w-1/3">
  <div>
    <div>
      {title}
      {location}
      {description}
  
    </div>
    <div>
      {rating}
    </div>
  </div>
</div> -->

<div class="bg-gray-800 p-6 rounded-lg mb-6 shadow-lg flex items-center justify-between flex-col">
  <img src={image} alt="bar" class="w-1/4 h-1/3">
  <div class="flex w-full justify-between">
    <div>
      <h2 class="text-2xl font-bold mb-2">Craft Beer Bar</h2>
      <p class="text-gray-400">San Francisco, CA</p>
    </div>
      <div class="bg-gray-700 text-white font-bold text-xl rounded-full w-12 h-12 flex items-center justify-center">
          4.8
      </div>
    </div>
    <div>
      <p class="text-gray-300 mt-2">Cozy neighborhood bar with an extensive selection of craft beers on tap and in bottles.</p>

    </div>
</div>
