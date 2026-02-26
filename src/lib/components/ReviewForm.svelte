<script lang="ts">
	import { descriptionTemplate } from '$lib/constants';
	import { generateSlug } from '$lib/utils/slug';
	import type { SerializedBarReview, BarReviewFormData } from '$lib/types/bar-review';

	interface Props {
		mode: 'create' | 'edit';
		bar?: SerializedBarReview | null;
		fieldError?: string;
		previousFormData?: BarReviewFormData | null;
	}

	let { mode, bar = null, fieldError = '', previousFormData = null }: Props = $props();

	let barName = $state(previousFormData?.barName ?? bar?.title ?? '');
	let description = $state(previousFormData?.description ?? bar?.description ?? '');
	let address = $state(previousFormData?.address ?? bar?.location ?? '');
	let slug = $state(previousFormData?.slug ?? bar?.slug ?? '');
	let coAuthors = $state(previousFormData?.coAuthors ?? bar?.coAuthors ?? '');

	let atmosphere = $state(previousFormData?.atmosphere ?? bar?.atmosphere ?? 0);
	let service = $state(previousFormData?.service ?? bar?.service ?? 0);
	let selection = $state(previousFormData?.selection ?? bar?.selection ?? 0);
	let quality = $state(previousFormData?.quality ?? bar?.quality ?? 0);
	let price = $state(previousFormData?.price ?? bar?.price ?? 0);
	let cleanliness = $state(previousFormData?.cleanliness ?? bar?.cleanliness ?? 0);
	let soundLevel = $state(previousFormData?.soundLevel ?? bar?.soundLevel ?? 0);

	const ratingFields = [
		{ name: 'atmosphere', label: 'Atmosphere', description: 'Overall vibe and ambiance' },
		{ name: 'service', label: 'Service', description: 'Staff friendliness and responsiveness' },
		{ name: 'selection', label: 'Selection', description: 'Variety of drinks and menu items' },
		{ name: 'quality', label: 'Quality', description: 'Quality of drinks and food' },
		{ name: 'price', label: 'Price', description: 'Value for money' },
		{ name: 'cleanliness', label: 'Cleanliness', description: 'Hygiene and tidiness' },
		{ name: 'soundLevel', label: 'Sound Level', description: 'Noise level (0=quiet, 5=loud)' }
	];

	function renderStars(value: number) {
		return '★'.repeat(value) + '☆'.repeat(5 - value);
	}

	function hasError(fieldName: string): boolean {
		return fieldError === `/${fieldName}` || fieldError === fieldName;
	}

	function getRatingValue(fieldName: string): number {
		const ratingMap: Record<string, number> = {
			atmosphere,
			service,
			selection,
			quality,
			price,
			cleanliness,
			soundLevel
		};
		return ratingMap[fieldName];
	}

	function updateRating(fieldName: string, value: number) {
		switch (fieldName) {
			case 'atmosphere':
				atmosphere = value;
				break;
			case 'service':
				service = value;
				break;
			case 'selection':
				selection = value;
				break;
			case 'quality':
				quality = value;
				break;
			case 'price':
				price = value;
				break;
			case 'cleanliness':
				cleanliness = value;
				break;
			case 'soundLevel':
				soundLevel = value;
				break;
		}
	}

	function autoGenerateSlug() {
		if (barName) {
			slug = generateSlug(barName);
		}
	}
</script>

<form method="post" enctype="multipart/form-data" class="mt-4 space-y-6 max-w-2xl">
	<!-- Basic Info Section -->
	<div class="bg-gray-800 py-4 px-4 rounded-lg sm:py-5 sm:px-5 md:py-6 md:px-6">
		<h2 class="text-lg font-semibold text-orange-600 mb-4">Basic Information</h2>

		<div>
			<label for="bar-name" class="block text-sm font-medium mb-2">Bar Name</label>
			<input
				type="text"
				name="bar-name"
				id="bar-name"
				class="bg-white rounded-md px-3 py-2 w-full text-black focus:outline-none focus:ring-orange-600 focus:ring-2 {hasError(
					'bar-name'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={barName}
				required
			/>
			{#if hasError('bar-name')}
				<p class="text-red-400 text-xs mt-1">Bar name is required</p>
			{/if}
		</div>

		<div class="mt-4">
			<label for="address" class="block text-sm font-medium mb-2">Address</label>
			<input
				type="text"
				name="address"
				id="address"
				class="bg-white text-black rounded-md py-2 px-3 w-full focus:outline-none focus:ring-orange-600 focus:ring-2 {hasError(
					'address'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={address}
			/>
			{#if hasError('address')}
				<p class="text-red-400 text-xs mt-1">Address is required</p>
			{/if}
		</div>

		<div class="mt-4">
			<label for="co-authors" class="block text-sm font-medium mb-2">Co-Authors (optional)</label>
			<input
				type="text"
				name="co-authors"
				id="co-authors"
				placeholder="e.g., John, Sarah, Mike"
				class="bg-white text-black rounded-md py-2 px-3 w-full focus:outline-none focus:ring-orange-600 focus:ring-2"
				bind:value={coAuthors}
			/>
			<p class="text-xs text-gray-400 mt-1">List other people who contributed to this review</p>
		</div>

		<div class="mt-4">
			<label for="image" class="block text-sm font-medium mb-2">
				Image {mode === 'edit' ? '(optional)' : '(required)'}
			</label>
			<input
				type="file"
				name="image"
				id="image"
				class="bg-white text-black rounded-md py-2 px-3 w-full focus:outline-none focus:ring-orange-600 focus:ring-2 {hasError(
					'image'
				)
					? 'ring-2 ring-red-600'
					: ''}"
			/>
			{#if hasError('image')}
				<p class="text-red-400 text-xs mt-1">Please select an image file</p>
			{/if}
		</div>
	</div>

	<!-- Description Section -->
	<div class="bg-gray-800 py-4 px-4 rounded-lg sm:py-5 sm:px-5 md:py-6 md:px-6">
		<h2 class="text-lg font-semibold text-orange-600 mb-4">Description</h2>

		<label for="description" class="block text-sm font-medium mb-2">Your Review</label>
		<textarea
			name="description"
			id="description"
			rows="6"
			placeholder={descriptionTemplate}
			class="bg-white text-black w-full rounded-md px-3 py-2 focus:outline-none focus:ring-orange-600 focus:ring-2 resize-none {hasError(
				'description'
			)
				? 'ring-2 ring-red-600'
				: ''}"
			bind:value={description}
		></textarea>
		{#if hasError('description')}
			<p class="text-red-400 text-xs mt-1">Description is required</p>
		{/if}
	</div>

	<!-- Ratings Section -->
	<div class="bg-gray-800 py-4 px-4 rounded-lg sm:py-5 sm:px-5 md:py-6 md:px-6">
		<h2 class="text-lg font-semibold text-orange-600 mb-6">Rate Your Experience</h2>
		<p class="text-sm text-gray-400 mb-6">Rate each aspect from 0 (poor) to 5 (excellent)</p>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
			{#each ratingFields as field (field.name)}
				<div class="flex flex-col">
					<label for={field.name} class="text-sm font-medium mb-2">
						{field.label}
					</label>
					<p class="text-xs text-gray-400 mb-2">{field.description}</p>
					<div class="flex items-center gap-3">
						<input
							type="range"
							name={field.name}
							id={field.name}
							min="0"
							max="5"
							step="1"
							class="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-600"
							value={getRatingValue(field.name)}
							oninput={(e) => updateRating(field.name, parseInt(e.currentTarget.value))}
						/>
						<span class="text-orange-600 font-bold min-w-12 text-center text-lg">
							{renderStars(getRatingValue(field.name))}
						</span>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Technical Section -->
	<div class="bg-gray-800 py-4 px-4 rounded-lg sm:py-5 sm:px-5 md:py-6 md:px-6">
		<h2 class="text-lg font-semibold text-orange-600 mb-4">Advanced Settings</h2>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
			<div class="flex-1">
				<label for="slug" class="block text-sm font-medium mb-2">URL Slug</label>
				<input
					type="text"
					name="slug"
					id="slug"
					class="bg-white text-black rounded-md py-2 px-3 w-full focus:outline-none focus:ring-orange-600 focus:ring-2 text-sm {hasError(
						'slug'
					)
						? 'ring-2 ring-red-600'
						: ''}"
					bind:value={slug}
				/>
			</div>
			<button
				type="button"
				onclick={autoGenerateSlug}
				class="bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition text-sm whitespace-nowrap"
			>
				Auto-generate
			</button>
		</div>
		<p class="text-xs text-gray-400 mt-1">
			This is used in the URL (e.g., /bar-name-slug). Swedish characters (åäö) are allowed.
		</p>
		{#if hasError('slug')}
			<p class="text-red-400 text-xs mt-1">Slug is required or already exists</p>
		{/if}
	</div>

	{#if mode === 'edit' && bar}
		<input type="hidden" name="id" value={bar._id} />
	{/if}

	<div class="flex gap-3">
		<button
			type="submit"
			class="flex-1 bg-orange-600 py-3 px-4 rounded-md font-medium focus:outline-none focus:ring-orange-600 focus:ring-2 hover:bg-orange-700 transition"
		>
			{mode === 'edit' ? 'Update review' : 'Create review'}
		</button>
		<button
			type="reset"
			class="flex-1 bg-gray-700 py-3 px-4 rounded-md font-medium focus:outline-none focus:ring-gray-600 focus:ring-2 hover:bg-gray-600 transition"
		>
			Clear
		</button>
	</div>
</form>
