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
			expect.objectContaining({ sort: { updatedAt: -1, _id: 1 } })
		);
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
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify([{ lat: '59.3293', lon: '18.0686' }]), { status: 200 })
				)
		);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toEqual({
			...publicReview,
			latitude: 59.3293,
			longitude: 18.0686
		});
		expect(mocks.geocodesInsertOne).toHaveBeenCalledWith(
			expect.objectContaining({
				addressKey: 'exempelgatan 1, stockholm',
				status: 'pending'
			})
		);
		expect(mocks.geocodesUpdateOne).toHaveBeenCalledWith(
			{ addressKey: 'exempelgatan 1, stockholm' },
			expect.objectContaining({
				$set: expect.objectContaining({ status: 'resolved', latitude: 59.3293, longitude: 18.0686 })
			})
		);

		const request = vi.mocked(fetch).mock.calls[0][0] as URL;
		expect(request.origin).toBe('https://nominatim.openstreetmap.org');
		expect(request.searchParams.get('q')).toBe(publicReview.location);
	});

	it('does not call Nominatim again while an unresolved address is cached', async () => {
		mocks.geocodesFindOne.mockResolvedValueOnce({
			addressKey: 'exempelgatan 1, stockholm',
			status: 'not_found',
			retryAt: new Date(Date.now() + 60_000)
		});
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const { resolveOnePublicReviewMapMarker } = await loadModule();

		await expect(resolveOnePublicReviewMapMarker()).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
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
