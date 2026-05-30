<script lang="ts">
	import { tick } from 'svelte';
	import {
		MAX_REVIEW_IMAGE_SIZE_BYTES,
		MAX_REVIEW_IMAGE_SIZE_MB,
		REVIEW_IMAGE_ACCEPT,
		REVIEW_IMAGE_ALLOWED_TYPES_LABEL,
		descriptionTemplate
	} from '$lib/constants';
	import { calculateOverallRating } from '$lib/utils/ratings';
	import { generateSlug } from '$lib/utils/slug';
	import type { SerializedBarReview, BarReviewFormData } from '$lib/types/bar-review';

	interface Props {
		mode: 'create' | 'edit';
		bar?: SerializedBarReview | null;
		fieldError?: string;
		fieldMessage?: string;
		previousFormData?: BarReviewFormData | null;
		availableUsers?: Array<{ username: string; _id: string }>;
		currentUsername?: string;
	}

	let {
		mode,
		bar = null,
		fieldError = '',
		fieldMessage = '',
		previousFormData = null,
		availableUsers = [],
		currentUsername = ''
	}: Props = $props();

	// Filter out current user from available co-authors
	const otherUsers = $derived(availableUsers.filter((u) => u.username !== currentUsername));

	const initialBarName = $derived(previousFormData?.barName ?? bar?.title ?? '');
	const initialDescription = $derived(previousFormData?.description ?? bar?.description ?? '');
	const initialAddress = $derived(previousFormData?.address ?? bar?.location ?? '');
	const initialSlug = $derived(previousFormData?.slug ?? bar?.slug ?? '');
	const initialRating = $derived(previousFormData?.rating ?? bar?.rating ?? 0);

	// Normalize coAuthors to array (handle both old string format and new array format)
	const initialCoAuthors = $derived.by(() => {
		const data = previousFormData?.coAuthors ?? bar?.coAuthors;
		if (Array.isArray(data)) return data;
		if (typeof data === 'string' && data) return [data];
		return [];
	});

	let barName = $state('');
	let description = $state('');
	let address = $state('');
	let slug = $state('');
	let coAuthors = $state<string[]>([]);

	type RatingKey =
		| 'atmosphere'
		| 'service'
		| 'selection'
		| 'quality'
		| 'price'
		| 'cleanliness'
		| 'soundLevel'
		| 'barhopPotential';

	const sliderLabels = [0, 1, 2, 3, 4, 5];
	const overallRatingLabels = [0, 1, 2, 3];
	const errorFocusTargets: Record<string, string> = {
		'/bar-name': 'bar-name',
		'/address': 'address',
		'/co-authors': 'co-authors-section',
		'/image': 'image',
		'/description': 'description',
		'/rating': 'rating',
		'/slug': 'slug'
	};

	const ratingMetrics: Array<{
		key: RatingKey;
		label: string;
		description: string;
		fullWidth?: boolean;
	}> = [
		{ key: 'atmosphere', label: 'Atmosfär', description: 'Stämning och känsla på platsen' },
		{ key: 'service', label: 'Service', description: 'Personalens bemötande och snabbhet' },
		{ key: 'selection', label: 'Utbud', description: 'Variation av drycker' },
		{ key: 'quality', label: 'Kvalitet', description: 'Kvalitet på dryck' },
		{ key: 'price', label: 'Prisvärdhet', description: 'Värde för pengarna' },
		{ key: 'cleanliness', label: 'Renlighet', description: 'Hygien och ordning' },
		{
			key: 'soundLevel',
			label: 'Ljudnivå',
			description: 'Ljudnivå (0=högljutt, 5=tyst)',
			fullWidth: true
		},
		{
			key: 'barhopPotential',
			label: 'Barhoppotential',
			description: 'Hur bra är baren för att hoppa vidare från?'
		}
	];

	const initialRatings = $derived.by<Record<RatingKey, number>>(() => ({
		atmosphere: previousFormData?.atmosphere ?? bar?.atmosphere ?? 0,
		service: previousFormData?.service ?? bar?.service ?? 0,
		selection: previousFormData?.selection ?? bar?.selection ?? 0,
		quality: previousFormData?.quality ?? bar?.quality ?? 0,
		price: previousFormData?.price ?? bar?.price ?? 0,
		cleanliness: previousFormData?.cleanliness ?? bar?.cleanliness ?? 0,
		soundLevel: previousFormData?.soundLevel ?? bar?.soundLevel ?? 0,
		barhopPotential: previousFormData?.barhopPotential ?? bar?.barhopPotential ?? 0
	}));

	let ratings = $state<Record<RatingKey, number>>({
		atmosphere: 0,
		service: 0,
		selection: 0,
		quality: 0,
		price: 0,
		cleanliness: 0,
		soundLevel: 0,
		barhopPotential: 0
	});
	let rating = $state(0);
	let clientImageError = $state('');
	let lastFocusedError = $state('');

	$effect(() => {
		barName = initialBarName;
		description = initialDescription;
		address = initialAddress;
		slug = initialSlug;
		coAuthors = initialCoAuthors;
		ratings = initialRatings;
		rating = initialRating;
	});

	$effect(() => {
		if (!fieldError || fieldError === lastFocusedError) return;
		lastFocusedError = fieldError;
		void focusErrorField(fieldError);
	});

	function hasError(fieldName: string): boolean {
		if (fieldName === 'image' && clientImageError) return true;
		return fieldError === `/${fieldName}` || fieldError === fieldName;
	}

	function getFieldErrorMessage(fieldName: string, fallback: string): string {
		if (fieldName === 'image' && clientImageError) return clientImageError;
		return hasError(fieldName) && fieldMessage ? fieldMessage : fallback;
	}

	async function focusErrorField(pointer: string) {
		const normalizedPointer = pointer.startsWith('/') ? pointer : `/${pointer}`;
		const targetId = errorFocusTargets[normalizedPointer];
		if (!targetId) return;

		await tick();

		const target = document.getElementById(targetId);
		if (!target) return;

		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (target instanceof HTMLElement) {
			target.focus({ preventScroll: true });
		}
	}

	function validateImageFile(file: File | undefined): string {
		if (!file) {
			return mode === 'create' ? 'Välj en bildfil' : '';
		}

		if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
			return `Bilden är för stor (max ${MAX_REVIEW_IMAGE_SIZE_MB} MB)`;
		}

		if (!REVIEW_IMAGE_ACCEPT.split(',').includes(file.type)) {
			return `Ogiltig filtyp. Endast ${REVIEW_IMAGE_ALLOWED_TYPES_LABEL} är tillåtna`;
		}

		return '';
	}

	function handleImageChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		clientImageError = validateImageFile(input.files?.[0]);
	}

	function handleSubmit(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		const imageInput = form.elements.namedItem('image') as HTMLInputElement | null;
		const imageError = validateImageFile(imageInput?.files?.[0]);

		if (imageError) {
			event.preventDefault();
			clientImageError = imageError;
			imageInput?.focus();
		}
	}

	function autoGenerateSlug() {
		slug = generateSlug(barName || '');
	}

	function calculateScore() {
		rating = calculateOverallRating(ratingMetrics.map((metric) => ratings[metric.key]));
	}
</script>

<form
	method="post"
	enctype="multipart/form-data"
	class="mt-4 space-y-6 max-w-2xl"
	onsubmit={handleSubmit}
>
	<!-- Grundinformation -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-4">Grundinformation</h2>

		<div>
			<label
				for="bar-name"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>Barens namn</label
			>
			<input
				type="text"
				name="bar-name"
				id="bar-name"
				class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
					'bar-name'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={barName}
				required
			/>
			{#if hasError('bar-name')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('bar-name', 'Barens namn är obligatoriskt')}
				</p>
			{/if}
		</div>

		<div class="mt-4">
			<label
				for="address"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>Adress</label
			>
			<input
				type="text"
				name="address"
				id="address"
				class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
					'address'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={address}
				required
			/>
			{#if hasError('address')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('address', 'Adress är obligatorisk')}
				</p>
			{/if}
		</div>

		<div id="co-authors-section" class="mt-4" tabindex="-1">
			<p class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
				Medförfattare (valfritt)
			</p>
			{#if otherUsers.length === 0}
				<p class="text-xs text-amber-600 mb-3">
					Inga andra användare tillgängliga för att lägga till som medförfattare.
				</p>
			{:else}
				<div
					class="space-y-2 rounded-2xl border border-white/85 bg-white/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
				>
					{#each otherUsers as user}
						<label class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition py-2">
							<input
								type="checkbox"
								value={user.username}
								checked={coAuthors.includes(user.username)}
								onchange={(e) => {
									const checked = (e.target as HTMLInputElement).checked;
									if (checked) {
										coAuthors = [...coAuthors, user.username];
									} else {
										coAuthors = coAuthors.filter((u) => u !== user.username);
									}
								}}
								class="w-5 h-5 rounded border-white/85 accent-sky-500 cursor-pointer"
							/>
							<span class="text-sm text-slate-700 font-medium flex-1">{user.username}</span>
						</label>
					{/each}
				</div>
			{/if}
			<p class="text-xs text-slate-500 mt-2">Välj andra personer som bidrog till recensionen</p>
			{#each coAuthors as author}
				<input type="hidden" name="co-authors" value={author} />
			{/each}
			{#if hasError('co-authors')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('co-authors', 'Medförfattarna är ogiltiga')}
				</p>
			{/if}
		</div>

		<div class="mt-4">
			<label
				for="image"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
			>
				Bild {mode === 'edit' ? '(valfritt)' : '(obligatoriskt)'}
			</label>
			<input
				type="file"
				name="image"
				id="image"
				class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 {hasError(
					'image'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				accept={REVIEW_IMAGE_ACCEPT}
				required={mode === 'create'}
				onchange={handleImageChange}
			/>
			{#if hasError('image')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('image', 'Välj en bildfil')}
				</p>
			{/if}
		</div>
	</div>

	<!-- Beskrivning -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-4">Beskrivning</h2>

		<label
			for="description"
			class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
		>
			Din recension
		</label>
		<textarea
			name="description"
			id="description"
			rows="6"
			placeholder={descriptionTemplate}
			class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 resize-none {hasError(
				'description'
			)
				? 'ring-2 ring-red-600'
				: ''}"
			bind:value={description}
			required
		></textarea>
		{#if hasError('description')}
			<p class="text-red-400 text-xs mt-1">
				{getFieldErrorMessage('description', 'Beskrivning är obligatorisk')}
			</p>
		{/if}
	</div>

	<!-- Betyg -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-3">Betygsätt din upplevelse</h2>
		<p class="text-sm text-slate-500 mb-6">Betygsätt varje del från 0 (svagt) till 5 (utmärkt)</p>

		<div class="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
			{#each ratingMetrics as metric}
				<div class={`flex flex-col ${metric.fullWidth ? 'md:col-span-2' : ''}`}>
					<label
						for={metric.key}
						class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
					>
						{metric.label}
					</label>
					<p class="text-xs text-slate-500 mb-2">{metric.description}</p>
					<div class="slider-container">
						<input
							type="range"
							name={metric.key}
							id={metric.key}
							min="0"
							max="5"
							step="1"
							class="w-full rating-slider"
							value={ratings[metric.key]}
							oninput={(e) => {
								ratings[metric.key] = Number((e.currentTarget as HTMLInputElement).value);
							}}
						/>
						<div class="slider-labels">
							{#each sliderLabels as n}
								<span>{n}</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<div
			class="mt-6 rounded-2xl border border-white/85 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<label
						for="rating"
						class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
					>
						Helhetsbetyg
					</label>
					<p class="mt-1 text-xs text-slate-500">
						Sätt slutbetyget manuellt, eller räkna ut ett förslag från delbetygen.
					</p>
				</div>
				<div class="flex items-center gap-3">
					<span class="text-2xl font-semibold text-slate-900">{rating}/3</span>
					<button
						type="button"
						onclick={calculateScore}
						class="rounded-full border border-white/85 bg-white/82 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700 transition hover:bg-white"
					>
						Räkna ut score
					</button>
				</div>
			</div>
			<div class="slider-container mt-4">
				<input
					type="range"
					name="rating"
					id="rating"
					min="0"
					max="3"
					step="1"
					class="w-full rating-slider"
					value={rating}
					oninput={(e) => {
						rating = Number((e.currentTarget as HTMLInputElement).value);
					}}
				/>
				<div class="slider-labels">
					{#each overallRatingLabels as n}
						<span>{n}</span>
					{/each}
				</div>
			</div>
			{#if hasError('rating')}
				<p class="text-red-400 text-xs mt-1">
					{getFieldErrorMessage('rating', 'Ogiltigt helhetsbetyg')}
				</p>
			{/if}
		</div>
	</div>

	<!-- Avancerade inställningar -->
	<div
		class="rounded-3xl border border-white/90 bg-white/68 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_30px_-26px_rgba(148,163,184,0.55)] backdrop-blur-xl sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-slate-900 mb-4">Avancerade inställningar</h2>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
			<div class="flex-1">
				<label
					for="slug"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2"
				>
					URL-slug
				</label>
				<input
					type="text"
					name="slug"
					id="slug"
					class="w-full rounded-2xl border border-white/85 bg-white/85 px-4 py-3 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] focus:outline-none focus:ring-2 focus:ring-sky-200 text-sm {hasError(
						'slug'
					)
						? 'ring-2 ring-red-600'
						: ''}"
					bind:value={slug}
					required
				/>
			</div>
			<button
				type="button"
				onclick={() => autoGenerateSlug()}
				class="rounded-full border border-white/85 bg-white/82 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white"
			>
				Generera automatiskt
			</button>
		</div>
		<p class="text-xs text-slate-500 mt-2">
			Detta används i URL:en (t.ex. /barens-namn). Svenska tecken (åäö) är tillåtna.
		</p>
		{#if hasError('slug')}
			<p class="text-red-400 text-xs mt-1">
				{getFieldErrorMessage('slug', 'Slug är obligatorisk eller finns redan')}
			</p>
		{/if}
	</div>

	{#if mode === 'edit' && bar}
		<input type="hidden" name="id" value={bar._id} />
	{/if}

	<div class="flex flex-col gap-3 sm:flex-row">
		<button
			type="submit"
			class="flex-1 rounded-full border border-white/85 bg-white/82 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white"
		>
			{mode === 'edit' ? 'Uppdatera recension' : 'Skapa recension'}
		</button>
		<button
			type="reset"
			class="flex-1 rounded-full border border-white/85 bg-white/75 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:bg-white/90"
		>
			Rensa
		</button>
	</div>
</form>

<style>
	.slider-container {
		position: relative;
		padding-bottom: 20px;
	}

	.rating-slider {
		height: 8px;
		border-radius: 8px;
		appearance: none;
		cursor: pointer;
		background: #e2e8f0;
		outline: none;
		width: 100%;
	}

	.rating-slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #cbd5e1;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.rating-slider::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.rating-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #cbd5e1;
		cursor: pointer;
		border: none;
		transition: transform 0.1s;
	}

	.rating-slider::-moz-range-thumb:hover {
		transform: scale(1.2);
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 8px;
		padding: 0 2px;
	}

	.slider-labels span {
		font-size: 0.875rem;
		font-weight: 600;
		color: #64748b;
		text-align: center;
		min-width: 20px;
	}
</style>
