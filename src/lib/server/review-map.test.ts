import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	barsFind: vi.fn(),
	barRows: vi.fn(),
	geocodesFind: vi.fn(),
	geocodeRows: vi.fn(),
	geocodesFindOne: vi.fn(),
	geocodesInsertOne: vi.fn(),
	geocodesUpdateOne: vi.fn()
}));

vi.mock('$lib/db/db', () => ({
	default: {
		collection: (name: string) => {
			if (name === 'bars') {
				return {
					find: mocks.barsFind
				};
			}

			return {
				find: mocks.geocodesFind,
				findOne: mocks.geocodesFindOne,
				insertOne: mocks.geocodesInsertOne,
				updateOne: mocks.geocodesUpdateOne
			};
		}
	}
}));

const publicReview = {
	title: 'Kartbaren',
	slug: 'kartbaren',
	rating: 3,
	location: 'Exempelgatan 1, Stockholm'
};

const tallinnReview = {
	...publicReview,
	slug: 'tallinn-baren',
	location: 'Kullassepa tn 4, 10146 Tallinn, Estland'
};

const tallinnResult = {
	lat: '59.4366859',
	lon: '24.7444712',
	address: {
		house_number: '4',
		road: 'Kullassepa',
		city: 'Tallinn',
		postcode: '10146'
	}
};

const loadModule = async () => {
	vi.resetModules();
	return import('./review-map');
};

beforeEach(() => {
	vi.restoreAllMocks();
	mocks.barsFind.mockReset();
	mocks.barRows.mockReset();
	mocks.geocodesFind.mockReset();
	mocks.geocodeRows.mockReset();
	mocks.geocodesFindOne.mockReset();
	mocks.geocodesInsertOne.mockReset();
	mocks.geocodesUpdateOne.mockReset();
	mocks.barsFind.mockImplementation(() => ({ toArray: mocks.barRows }));
	mocks.geocodesFind.mockImplementation(() => ({ toArray: mocks.geocodeRows }));
	mocks.barRows.mockResolvedValue([publicReview]);
	mocks.geocodeRows.mockResolvedValue([]);
	mocks.geocodesFindOne.mockResolvedValue(null);
	mocks.geocodesInsertOne.mockResolvedValue({ acknowledged: true });
	mocks.geocodesUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('public review map data', () => {
	it('returns valid resolved coordinates and queries with the strict public filter', async () => {
		mocks.geocodeRows.mockResolvedValueOnce([
			{
				addressKey: 'exempelgatan 1, stockholm',
				status: 'resolved',
				latitude: 59.3293,
				longitude: 18.0686
			}
		]);
		const { getPublicReviewMapData } = await loadModule();

		await expect(getPublicReviewMapData()).resolves.toEqual({
			markers: [{ ...publicReview, latitude: 59.3293, longitude: 18.0686 }],
			totalReviews: 1
		});
		expect(mocks.barsFind).toHaveBeenCalledWith(
			{
				$or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }]
			},
			{
				projection: {
					_id: 0,
					title: 1,
					slug: 1,
					rating: 1,
					location: 1,
					beerPriceKr: 1,
					isHappyHourPrice: 1
				},
				sort: { updatedAt: -1, _id: 1 }
			}
		);
	});

	it('serializes valid regular and happy hour prices', async () => {
		mocks.barRows.mockResolvedValueOnce([
			{ ...publicReview, beerPriceKr: 65, isHappyHourPrice: false },
			{
				...publicReview,
				slug: 'happy-hour-baren',
				beerPriceKr: 79,
				isHappyHourPrice: true
			}
		]);
		mocks.geocodeRows.mockResolvedValueOnce([
			{
				addressKey: 'exempelgatan 1, stockholm',
				status: 'resolved',
				latitude: 59.3293,
				longitude: 18.0686
			}
		]);
		const { getPublicReviewMapData } = await loadModule();

		await expect(getPublicReviewMapData()).resolves.toEqual({
			markers: [
				{
					...publicReview,
					beerPriceKr: 65,
					isHappyHourPrice: false,
					latitude: 59.3293,
					longitude: 18.0686
				},
				{
					...publicReview,
					slug: 'happy-hour-baren',
					beerPriceKr: 79,
					isHappyHourPrice: true,
					latitude: 59.3293,
					longitude: 18.0686
				}
			],
			totalReviews: 2
		});
	});

	it('keeps the marker but omits invalid price data', async () => {
		mocks.barRows.mockResolvedValueOnce([
			{ ...publicReview, beerPriceKr: 1_000, isHappyHourPrice: true }
		]);
		mocks.geocodeRows.mockResolvedValueOnce([
			{
				addressKey: 'exempelgatan 1, stockholm',
				status: 'resolved',
				latitude: 59.3293,
				longitude: 18.0686
			}
		]);
		const { getPublicReviewMapData } = await loadModule();

		await expect(getPublicReviewMapData()).resolves.toEqual({
			markers: [{ ...publicReview, latitude: 59.3293, longitude: 18.0686 }],
			totalReviews: 1
		});
	});

	it('omits malformed coordinates without dropping the review count', async () => {
		mocks.geocodeRows.mockResolvedValueOnce([
			{
				addressKey: 'exempelgatan 1, stockholm',
				status: 'resolved',
				latitude: 100,
				longitude: 18.0686
			}
		]);
		const { getPublicReviewMapData } = await loadModule();

		await expect(getPublicReviewMapData()).resolves.toEqual({ markers: [], totalReviews: 1 });
	});

	it('reuses cached data until it is invalidated', async () => {
		const { getPublicReviewMapData, invalidatePublicReviewMapCache } = await loadModule();

		await getPublicReviewMapData();
		await getPublicReviewMapData();
		expect(mocks.barsFind).toHaveBeenCalledTimes(1);

		invalidatePublicReviewMapCache();
		await getPublicReviewMapData();
		expect(mocks.barsFind).toHaveBeenCalledTimes(2);
	});

	it('shares an in-flight map data read between simultaneous requests', async () => {
		let resolveRows: (value: (typeof publicReview)[]) => void;
		mocks.barRows.mockImplementationOnce(
			() => new Promise<(typeof publicReview)[]>((resolve) => (resolveRows = resolve))
		);
		const { getPublicReviewMapData } = await loadModule();

		const firstRequest = getPublicReviewMapData();
		const secondRequest = getPublicReviewMapData();
		expect(mocks.barsFind).toHaveBeenCalledTimes(1);

		resolveRows!([publicReview]);
		await expect(Promise.all([firstRequest, secondRequest])).resolves.toHaveLength(2);
	});

	it('normalizes whitespace, control characters, and Swedish casing in address cache keys', async () => {
		const { normalizeMapAddress } = await loadModule();

		expect(normalizeMapAddress('  MÅSgatan\u0000  4\n ')).toBe('måsgatan 4');
	});
});

describe('gradual public geocoding', () => {
	it('persists a valid Nominatim result and invalidates the public map cache', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify([{ lat: '59.3293', lon: '18.0686' }]), { status: 200 })
			);
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toEqual({
			...publicReview,
			latitude: 59.3293,
			longitude: 18.0686
		});
		expect(mocks.geocodesInsertOne).toHaveBeenCalledWith(
			expect.objectContaining({
				addressKey: 'exempelgatan 1, stockholm',
				status: 'pending',
				strategyVersion: 2
			})
		);
		expect(mocks.geocodesUpdateOne).toHaveBeenCalledWith(
			{ addressKey: 'exempelgatan 1, stockholm' },
			expect.objectContaining({
				$set: expect.objectContaining({
					status: 'resolved',
					strategyVersion: 2,
					latitude: 59.3293,
					longitude: 18.0686
				})
			})
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const request = fetchMock.mock.calls[0][0] as URL;
		expect(request.origin).toBe('https://nominatim.openstreetmap.org');
		expect(request.searchParams.get('q')).toBe(publicReview.location);
		expect(request.searchParams.get('limit')).toBe('1');
		expect(request.searchParams.get('addressdetails')).toBe('0');
	});

	it('does not call Nominatim again while an unresolved address is cached', async () => {
		mocks.geocodesFindOne.mockResolvedValueOnce({
			addressKey: 'exempelgatan 1, stockholm',
			status: 'not_found',
			strategyVersion: 2,
			retryAt: new Date(Date.now() + 60_000)
		});
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('retries a cached negative result from an older geocoding strategy', async () => {
		mocks.geocodesFindOne.mockResolvedValueOnce({
			addressKey: 'exempelgatan 1, stockholm',
			status: 'not_found',
			retryAt: new Date(Date.now() + 60_000)
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify([{ lat: '59.3293', lon: '18.0686' }]), { status: 200 })
			);
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toMatchObject({
			slug: publicReview.slug,
			latitude: 59.3293,
			longitude: 18.0686
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(mocks.geocodesUpdateOne.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				addressKey: 'exempelgatan 1, stockholm',
				status: { $ne: 'resolved' }
			})
		);
		expect(mocks.geocodesUpdateOne.mock.calls[0][1]).toEqual(
			expect.objectContaining({
				$set: expect.objectContaining({ status: 'pending', strategyVersion: 2 })
			})
		);
	});

	it('resolves a validated fallback after removing a standalone street type', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		mocks.barRows.mockResolvedValueOnce([tallinnReview]);
		const requestTimes: number[] = [];
		const responses = [
			new Response(JSON.stringify([]), { status: 200 }),
			new Response(JSON.stringify([tallinnResult]), { status: 200 })
		];
		const fetchMock = vi.fn((_input: RequestInfo | URL) => {
			requestTimes.push(Date.now());
			return Promise.resolve(responses.shift()!);
		});
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		const resolution = resolveOnePublicReviewMapMarker();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await vi.runOnlyPendingTimersAsync();
		await expect(resolution).resolves.toEqual({
			...tallinnReview,
			latitude: 59.4366859,
			longitude: 24.7444712
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(1_000);
		const fallbackRequest = fetchMock.mock.calls[1][0] as URL;
		expect(fallbackRequest.searchParams.get('q')).toBe('Kullassepa 4, 10146 Tallinn, Estland');
		expect(fallbackRequest.searchParams.get('limit')).toBe('5');
		expect(fallbackRequest.searchParams.get('addressdetails')).toBe('1');
		expect(fallbackRequest.searchParams.get('layer')).toBe('address');
	});

	it('rejects fallback results that do not match every required address component', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		mocks.barRows.mockResolvedValueOnce([tallinnReview]);
		const mismatchedResults = [
			{ ...tallinnResult, address: { ...tallinnResult.address, road: 'Niguliste' } },
			{ ...tallinnResult, address: { ...tallinnResult.address, house_number: '5' } },
			{ ...tallinnResult, address: { ...tallinnResult.address, city: 'Tartu' } },
			{ ...tallinnResult, address: { ...tallinnResult.address, postcode: '99999' } }
		];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(mismatchedResults), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		const resolution = resolveOnePublicReviewMapMarker();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(resolution).resolves.toBeNull();
		expect(mocks.geocodesUpdateOne).toHaveBeenLastCalledWith(
			{ addressKey: 'kullassepa tn 4, 10146 tallinn, estland' },
			expect.objectContaining({
				$set: expect.objectContaining({ status: 'not_found', strategyVersion: 2 })
			})
		);
	});

	it('does not relax addresses without a supported standalone street type', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(mocks.geocodesUpdateOne).toHaveBeenLastCalledWith(
			{ addressKey: 'exempelgatan 1, stockholm' },
			expect.objectContaining({
				$set: expect.objectContaining({ status: 'not_found', strategyVersion: 2 })
			})
		);
	});

	it('stores Nominatim transport errors as temporary failures without a fallback request', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(mocks.geocodesUpdateOne).toHaveBeenLastCalledWith(
			{ addressKey: 'exempelgatan 1, stockholm' },
			expect.objectContaining({
				$set: expect.objectContaining({ status: 'failed', strategyVersion: 2 })
			})
		);
	});

	it('does not start a second geocoding request while one is in flight', async () => {
		let resolveFetch: (value: Response) => void;
		const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		const firstResolution = resolveOnePublicReviewMapMarker();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await expect(resolveOnePublicReviewMapMarker()).resolves.toBeNull();
		resolveFetch!(
			new Response(JSON.stringify([{ lat: '59.3293', lon: '18.0686' }]), { status: 200 })
		);
		await expect(firstResolution).resolves.toMatchObject({ slug: publicReview.slug });
	});

	it('waits a second between Nominatim requests', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		mocks.barRows
			.mockResolvedValueOnce([publicReview])
			.mockResolvedValueOnce([{ ...publicReview, slug: 'andra-baren', location: 'Andra gatan 2' }]);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify([{ lat: '59.3293', lon: '18.0686' }]), { status: 200 })
			);
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await resolveOnePublicReviewMapMarker();
		const secondResolution = resolveOnePublicReviewMapMarker();
		await vi.advanceTimersByTimeAsync(999);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await secondResolution;
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
