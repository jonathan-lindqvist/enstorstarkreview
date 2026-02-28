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

	function hasError(fieldName: string): boolean {
		return fieldError === `/${fieldName}` || fieldError === fieldName;
	}

	function autoGenerateSlug() {
		slug = generateSlug(barName || '');
	}
</script>

<form method="post" enctype="multipart/form-data" class="mt-4 space-y-6 max-w-2xl">
	<!-- Grundinformation -->
	<div
		class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 px-4 py-4 sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-[var(--color-char)] mb-4">Grundinformation</h2>

		<div>
			<label
				for="bar-name"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
				>Barens namn</label
			>
			<input
				type="text"
				name="bar-name"
				id="bar-name"
				class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)] {hasError(
					'bar-name'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={barName}
				required
			/>
			{#if hasError('bar-name')}
				<p class="text-red-400 text-xs mt-1">Barens namn är obligatoriskt</p>
			{/if}
		</div>

		<div class="mt-4">
			<label
				for="address"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
				>Adress</label
			>
			<input
				type="text"
				name="address"
				id="address"
				class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)] {hasError(
					'address'
				)
					? 'ring-2 ring-red-600'
					: ''}"
				bind:value={address}
			/>
			{#if hasError('address')}
				<p class="text-red-400 text-xs mt-1">Adress är obligatorisk</p>
			{/if}
		</div>

		<div class="mt-4">
			<label
				for="co-authors"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
			>
				Medförfattare (valfritt)
			</label>
			<input
				type="text"
				name="co-authors"
				id="co-authors"
				placeholder="t.ex. Anna, Erik, Sara"
				class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)]"
				bind:value={coAuthors}
			/>
			<p class="text-xs text-[color:var(--color-char)]/60 mt-1">
				Lista andra personer som bidrog till recensionen
			</p>
		</div>

		<div class="mt-4">
			<label
				for="image"
				class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
			>
				Bild {mode === 'edit' ? '(valfritt)' : '(obligatoriskt)'}
			</label>
			<input
				type="file"
				name="image"
				id="image"
				class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)] {hasError(
					'image'
				)
					? 'ring-2 ring-red-600'
					: ''}"
			/>
			{#if hasError('image')}
				<p class="text-red-400 text-xs mt-1">Välj en bildfil</p>
			{/if}
		</div>
	</div>

	<!-- Beskrivning -->
	<div
		class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 px-4 py-4 sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-[var(--color-char)] mb-4">Beskrivning</h2>

		<label
			for="description"
			class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
		>
			Din recension
		</label>
		<textarea
			name="description"
			id="description"
			rows="6"
			placeholder={descriptionTemplate}
			class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)] resize-none {hasError(
				'description'
			)
				? 'ring-2 ring-red-600'
				: ''}"
			bind:value={description}
		></textarea>
		{#if hasError('description')}
			<p class="text-red-400 text-xs mt-1">Beskrivning är obligatorisk</p>
		{/if}
	</div>

	<!-- Betyg -->
	<div
		class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 px-4 py-4 sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-[var(--color-char)] mb-3">Betygsätt din upplevelse</h2>
		<p class="text-sm text-[color:var(--color-char)]/60 mb-6">
			Betygsätt varje del från 0 (svagt) till 5 (utmärkt)
		</p>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
			<div class="flex flex-col">
				<label
					for="atmosphere"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Atmosfär</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">Stämning och känsla på platsen</p>
				<div class="slider-container">
					<input
						type="range"
						name="atmosphere"
						id="atmosphere"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={atmosphere}
						oninput={(e) => (atmosphere = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col">
				<label
					for="service"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Service</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">
					Personalens bemötande och snabbhet
				</p>
				<div class="slider-container">
					<input
						type="range"
						name="service"
						id="service"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={service}
						oninput={(e) => (service = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col">
				<label
					for="selection"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Utbud</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">Variation av drycker och meny</p>
				<div class="slider-container">
					<input
						type="range"
						name="selection"
						id="selection"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={selection}
						oninput={(e) => (selection = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col">
				<label
					for="quality"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Kvalitet</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">Kvalitet på dryck och mat</p>
				<div class="slider-container">
					<input
						type="range"
						name="quality"
						id="quality"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={quality}
						oninput={(e) => (quality = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col">
				<label
					for="price"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Prisvärdhet</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">Värde för pengarna</p>
				<div class="slider-container">
					<input
						type="range"
						name="price"
						id="price"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={price}
						oninput={(e) => (price = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col">
				<label
					for="cleanliness"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Renlighet</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">Hygien och ordning</p>
				<div class="slider-container">
					<input
						type="range"
						name="cleanliness"
						id="cleanliness"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={cleanliness}
						oninput={(e) => (cleanliness = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col md:col-span-2">
				<label
					for="soundLevel"
					class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
					>Ljudnivå</label
				>
				<p class="text-xs text-[color:var(--color-char)]/60 mb-2">Ljudnivå (0=tyst, 5=högljutt)</p>
				<div class="slider-container">
					<input
						type="range"
						name="soundLevel"
						id="soundLevel"
						min="0"
						max="5"
						step="1"
						class="w-full rating-slider"
						value={soundLevel}
						oninput={(e) => (soundLevel = Number((e.currentTarget as HTMLInputElement).value))}
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>1</span>
						<span>2</span>
						<span>3</span>
						<span>4</span>
						<span>5</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Avancerade inställningar -->
	<div
		class="rounded-3xl border border-[color:var(--color-char)]/12 bg-white/80 px-4 py-4 sm:px-6 sm:py-5"
	>
		<h2 class="text-lg font-semibold text-[var(--color-char)] mb-4">Avancerade inställningar</h2>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
			<div class="flex-1">
				<label
					for="slug"
					class="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-moss)] mb-2"
				>
					URL-slug
				</label>
				<input
					type="text"
					name="slug"
					id="slug"
					class="w-full rounded-2xl border border-[color:var(--color-char)]/12 bg-white/90 px-4 py-3 text-[var(--color-char)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ember)] text-sm {hasError(
						'slug'
					)
						? 'ring-2 ring-red-600'
						: ''}"
					bind:value={slug}
				/>
			</div>
			<button
				type="button"
				onclick={() => autoGenerateSlug()}
				class="rounded-full border border-[color:var(--color-char)]/12 bg-[var(--color-ember)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5"
			>
				Generera automatiskt
			</button>
		</div>
		<p class="text-xs text-[color:var(--color-char)]/60 mt-2">
			Detta används i URL:en (t.ex. /barens-namn). Svenska tecken (åäö) är tillåtna.
		</p>
		{#if hasError('slug')}
			<p class="text-red-400 text-xs mt-1">Slug är obligatorisk eller finns redan</p>
		{/if}
	</div>

	{#if mode === 'edit' && bar}
		<input type="hidden" name="id" value={bar._id} />
	{/if}

	<div class="flex flex-col gap-3 sm:flex-row">
		<button
			type="submit"
			class="flex-1 rounded-full bg-[var(--color-ember)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5"
		>
			{mode === 'edit' ? 'Uppdatera recension' : 'Skapa recension'}
		</button>
		<button
			type="reset"
			class="flex-1 rounded-full border border-[color:var(--color-char)]/12 bg-white/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[var(--color-char)] transition hover:-translate-y-0.5"
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
		background: var(--color-clay);
		outline: none;
		width: 100%;
	}

	.rating-slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--color-ember);
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
		background: var(--color-ember);
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
		color: var(--color-moss);
		text-align: center;
		min-width: 20px;
	}
</style>
