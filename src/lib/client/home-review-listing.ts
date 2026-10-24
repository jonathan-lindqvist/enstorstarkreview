import { HOME_REVIEW_PAGE_SIZE, homeReviewParams } from '#lib/home-reviews.js';
import { sortHomeReviews } from '#lib/utils/home-review-sort.js';
import { distanceKm } from '#lib/utils/review-distance.js';
import type {
	HomeReviewIndexEntry,
	HomeReviewPage,
	HomeReviewQuery
} from '#lib/types/home-reviews.js';
import type { Coordinates } from '#lib/types/review-location.js';

export interface HomeListingState extends HomeReviewPage {
	query: HomeReviewQuery;
	loading: boolean;
	error: string | null;
}

export const initialHomeListingState = (
	initial: HomeReviewPage,
	query: HomeReviewQuery
): HomeListingState => ({
	bars: initial.bars,
	coordinatesByReviewId: initial.coordinatesByReviewId,
	page: initial.page,
	nextPage: initial.nextPage,
	query: { search: query.search, sort: query.sort, attributes: query.attributes, page: query.page },
	loading: false,
	error: null
});

/** Owns request cancellation and pagination; visitor location is never serialized or transmitted. */
export const createHomeReviewListing = ({
	initial,
	query,
	onChange,
	fetcher = fetch
}: {
	initial: HomeReviewPage;
	query: HomeReviewQuery;
	onChange: (state: HomeListingState) => void;
	fetcher?: typeof fetch;
}) => {
	let state = initialHomeListingState(initial, query);
	let position: Coordinates | null = null;
	let index: HomeReviewIndexEntry[] | null = null;
	let cards = new Map(initial.bars.map((bar) => [bar._id, bar]));
	let coordinates = { ...initial.coordinatesByReviewId };
	let generation = 0;
	let abort = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let refreshNeeded = false;
	let nearestCount = HOME_REVIEW_PAGE_SIZE;

	const publish = (patch: Partial<HomeListingState>) => {
		state = { ...state, ...patch };
		onChange(state);
	};
	const cancel = () => {
		generation += 1;
		abort.abort();
		abort = new AbortController();
		clearTimeout(timer);
	};
	const run = async (append: boolean) => {
		const version = generation;
		const signal = abort.signal;
		const selectedQuery = state.query;
		const selectedPosition = position;
		publish({ loading: true, error: null });
		const read = async (extras: Record<string, string>, page = selectedQuery.page) => {
			const params = homeReviewParams({ ...selectedQuery, page });
			for (const [key, value] of Object.entries(extras)) params.set(key, value);
			const response = await fetcher(`/recensioner/data?${params}`, { signal });
			if (!response.ok) throw new Error('Listing unavailable');
			const body = await response.json();
			if (version !== generation) throw new Error('Superseded listing');
			return body;
		};
		try {
			let result: HomeReviewPage;
			if (selectedQuery.sort === 'nearest' && selectedPosition) {
				if (!index) index = (await read({ view: 'index' })).index;
				for (const entry of index!) {
					if (entry.coordinates) coordinates[entry.id] = entry.coordinates;
				}
				const ordered = sortHomeReviews(index!, 'nearest', (entry) => ({
					id: entry.id,
					createdAt: entry.createdAt,
					rating: 0,
					distanceKm: distanceKm(selectedPosition, entry.coordinates)
				}));
				const count = append ? nearestCount + HOME_REVIEW_PAGE_SIZE : nearestCount;
				const wanted = ordered.slice(0, count);
				const missing = wanted.filter((entry) => !cards.has(entry.id));
				for (let offset = 0; offset < missing.length; offset += HOME_REVIEW_PAGE_SIZE) {
					const batch: HomeReviewPage = await read({
						ids: missing
							.slice(offset, offset + HOME_REVIEW_PAGE_SIZE)
							.map((entry) => entry.id)
							.join(',')
					});
					for (const bar of batch.bars) cards.set(bar._id, bar);
					Object.assign(coordinates, batch.coordinatesByReviewId);
				}
				nearestCount = count;
				result = {
					bars: wanted.flatMap((entry) => (cards.has(entry.id) ? [cards.get(entry.id)!] : [])),
					coordinatesByReviewId: coordinates,
					page: 1,
					nextPage: count < ordered.length ? Math.floor(count / HOME_REVIEW_PAGE_SIZE) + 1 : null
				};
			} else {
				const page = append ? state.nextPage : selectedQuery.page;
				if (page == null) {
					publish({ loading: false });
					return;
				}
				const batch: HomeReviewPage = await read({}, page);
				for (const bar of batch.bars) cards.set(bar._id, bar);
				Object.assign(coordinates, batch.coordinatesByReviewId);
				const combined = append ? [...state.bars, ...batch.bars] : batch.bars;
				result = {
					...batch,
					bars: [...new Map(combined.map((bar) => [bar._id, bar])).values()],
					coordinatesByReviewId: coordinates
				};
			}
			if (version !== generation) return;
			refreshNeeded = false;
			publish({ ...result, loading: false, error: null });
		} catch {
			if (version === generation) {
				publish({ loading: false, error: 'Kunde inte hämta recensionerna. Försök igen.' });
			}
		}
	};
	return {
		setQuery(next: HomeReviewQuery, delay = 0) {
			cancel();
			index = null;
			cards = new Map();
			coordinates = {};
			nearestCount = HOME_REVIEW_PAGE_SIZE;
			refreshNeeded = true;
			publish({ query: next, loading: true, error: null });
			timer = setTimeout(() => void run(false), delay);
		},
		setPosition(next: Coordinates | null) {
			if (position?.latitude === next?.latitude && position?.longitude === next?.longitude) return;
			position = next;
			if (state.query.sort !== 'nearest') return;
			cancel();
			refreshNeeded = true;
			void run(false);
		},
		loadMore() {
			if (state.loading || state.error || state.nextPage == null) return;
			return run(true);
		},
		retry() {
			return run(!refreshNeeded);
		},
		capture(): HomeListingState {
			return {
				...state,
				coordinatesByReviewId: { ...coordinates },
				loading: refreshNeeded,
				error: null
			};
		},
		restore(saved: HomeListingState) {
			cancel();
			index = null;
			refreshNeeded = false;
			cards = new Map(saved.bars.map((bar) => [bar._id, bar]));
			coordinates = { ...saved.coordinatesByReviewId };
			nearestCount = Math.max(HOME_REVIEW_PAGE_SIZE, saved.bars.length);
			publish({ ...saved, loading: false });
			if (saved.loading) void run(false);
		},
		dispose: cancel
	};
};
