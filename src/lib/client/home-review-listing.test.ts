import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	createHomeReviewListing,
	initialHomeListingState,
	type HomeListingState
} from './home-review-listing';
import type { HomeReviewCard, HomeReviewPage, HomeReviewQuery } from '$lib/types/home-reviews';

const query: HomeReviewQuery = { search: '', sort: 'latest', attributes: [], page: 1 };
const card = (number: number) =>
	({
		_id: number.toString(16).padStart(24, '0'),
		title: `Bar ${number}`,
		slug: `bar-${number}`,
		createdAt: '2026-01-01'
	}) as HomeReviewCard;
const batch = (numbers: number[], nextPage: number | null = null): HomeReviewPage => ({
	bars: numbers.map(card),
	coordinatesByReviewId: {},
	page: 1,
	nextPage
});
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const setup = (fetcher = vi.fn(), initial = batch([1, 2], 2), selectedQuery = query) => {
	let state = initialHomeListingState(initial, selectedQuery);
	const client = createHomeReviewListing({
		initial,
		query: selectedQuery,
		fetcher: fetcher as typeof fetch,
		onChange: (value) => (state = value)
	});
	return { client, fetcher, state: () => state };
};
const deferred = () => {
	let resolve!: (value: Response) => void;
	const promise = new Promise<Response>((done) => (resolve = done));
	return { promise, resolve };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('appends without duplicates and admits only one automatic request at a time', async () => {
	const pending = deferred();
	const test = setup(vi.fn(() => pending.promise));
	const work = test.client.loadMore();
	await test.client.loadMore();
	expect(test.fetcher).toHaveBeenCalledTimes(1);
	expect(String(test.fetcher.mock.calls[0][0])).toContain('page=2');
	pending.resolve(response(batch([2, 3])));
	await work;
	expect(test.state().bars.map((bar) => bar.title)).toEqual(['Bar 1', 'Bar 2', 'Bar 3']);
	await test.client.loadMore();
	expect(test.fetcher).toHaveBeenCalledTimes(1);
	test.client.dispose();
});

it('debounces search, aborts prior work and ignores responses from superseded searches', async () => {
	const old = deferred(),
		fresh = deferred();
	const test = setup(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise));
	test.client.setQuery({ ...query, search: 'old' }, 250);
	await vi.advanceTimersByTimeAsync(249);
	expect(test.fetcher).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	test.client.setQuery({ ...query, search: 'new' }, 250);
	expect(test.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
	await vi.advanceTimersByTimeAsync(250);
	fresh.resolve(response(batch([30])));
	await vi.advanceTimersByTimeAsync(0);
	old.resolve(response(batch([10])));
	await vi.advanceTimersByTimeAsync(0);
	expect(test.state().bars.map((bar) => bar.title)).toEqual(['Bar 30']);
	expect(test.state().error).toBeNull();
	test.client.dispose();
});

it('waits for an explicit retry after failure and keeps the previous cards readable', async () => {
	const test = setup(
		vi
			.fn()
			.mockResolvedValueOnce(new Response('', { status: 503 }))
			.mockResolvedValueOnce(response(batch([3])))
	);
	await test.client.loadMore();
	expect(test.state().error).toContain('Försök igen');
	expect(test.state().bars).toHaveLength(2);
	await test.client.loadMore();
	expect(test.fetcher).toHaveBeenCalledTimes(1);
	await test.client.retry();
	expect(test.state().bars).toHaveLength(3);
	expect(test.state().error).toBeNull();
	test.client.dispose();
});

it('retries replacement searches without mixing their cards with an old query', async () => {
	const test = setup(
		vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(response(batch([5])))
	);
	test.client.setQuery({ ...query, search: 'global', sort: 'oldest', attributes: ['quiz'] });
	await vi.advanceTimersByTimeAsync(0);
	expect(test.state().error).toBeTruthy();
	await test.client.retry();
	expect(test.state().bars.map((bar) => bar.title)).toEqual(['Bar 5']);
	expect(String(test.fetcher.mock.calls[1][0])).toContain('attributes=quiz');
	test.client.dispose();
});

it('sorts globally from a small index and fetches at most 24 missing cards per request', async () => {
	const index = Array.from({ length: 30 }, (_, number) => ({
		id: card(number)._id,
		createdAt: '2026-01-01',
		coordinates: number ? { latitude: number / 100, longitude: 0 } : null
	}));
	const fetcher = vi.fn(async (input: string) => {
		const params = new URL(input, 'https://example.test').searchParams;
		if (params.get('view') === 'index') return response({ index });
		if (!params.has('ids')) return response(batch([1, 2]));
		const ids = params.get('ids')!.split(',');
		expect(ids.length).toBeLessThanOrEqual(24);
		return response({ ...batch(ids.map((id) => parseInt(id, 16))), coordinatesByReviewId: {} });
	});
	const test = setup(fetcher, batch([1, 2], 2), { ...query, sort: 'nearest' });
	test.client.setPosition({ latitude: 0.29, longitude: 0 });
	await vi.advanceTimersByTimeAsync(0);
	expect(test.state().bars[0]._id).toBe(card(29)._id);
	expect(test.state().bars).toHaveLength(24);
	expect(test.state().nextPage).toBe(2);
	await test.client.loadMore();
	expect(test.state().bars).toHaveLength(30);
	expect(test.state().bars.at(-1)?._id).toBe(card(0)._id);
	test.client.setPosition({ latitude: 0.01, longitude: 0 });
	await vi.advanceTimersByTimeAsync(0);
	expect(test.state().bars[0]._id).toBe(card(1)._id);
	test.client.setPosition({ latitude: 0.01, longitude: 0 });
	expect(fetcher.mock.calls.filter(([path]) => path.includes('view=index'))).toHaveLength(1);
	expect(fetcher.mock.calls.every(([path]) => !/latitude|longitude/.test(path))).toBe(true);
	test.client.setPosition(null);
	await vi.advanceTimersByTimeAsync(0);
	expect(test.state().bars).toHaveLength(2);
	test.client.dispose();
});

it('restores loaded cards without serializing visitor location and cancels pending timers on disposal', async () => {
	const test = setup();
	test.client.setPosition({ latitude: 50, longitude: 12 });
	expect(test.fetcher).not.toHaveBeenCalled();
	const saved: HomeListingState = { ...test.client.capture(), ...batch([5, 6, 7], 3) };
	expect(saved).not.toHaveProperty('position');
	test.client.restore(saved);
	expect(test.state().bars).toHaveLength(3);
	test.client.setQuery(query, 250);
	test.client.dispose();
	await vi.advanceTimersByTimeAsync(300);
	expect(test.fetcher).not.toHaveBeenCalled();
});

it('permits retrying an empty completed listing without issuing another request', async () => {
	const test = setup(vi.fn(), batch([]));
	await test.client.retry();
	expect(test.state().loading).toBe(false);
	expect(test.fetcher).not.toHaveBeenCalled();
});

it('restarts an interrupted replacement when restoring, without retaining extra page data', async () => {
	const initial = { ...batch([1]), user: { username: 'editor' } };
	const test = setup(vi.fn().mockResolvedValue(response(batch([5]))), initial);
	expect(test.client.capture()).not.toHaveProperty('user');
	expect(test.client.capture().query).not.toHaveProperty('bars');
	test.client.setQuery({ ...query, search: 'new' }, 250);
	const saved = test.client.capture();
	test.client.restore(saved);
	await vi.advanceTimersByTimeAsync(0);
	expect(test.state().bars.map((bar) => bar.title)).toEqual(['Bar 5']);
	test.client.dispose();
});
