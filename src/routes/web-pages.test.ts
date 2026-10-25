import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { makeTestWorld, useTestApp, webEvent, type TestWorld } from '$lib/server/testing';
import { load as historyLoad } from './[slug]/history/+page.server';
import { load as adminLoad } from './admin/reviews/+page.server';
import { GET as imageGet } from './images/[filename]/+server';
import { load as mapLoad } from './karta/+page.server';
import { POST as nextMarker } from './karta/next-marker/+server';
import { actions as loginActions } from './login/+page.server';
import { load as statisticsLoad } from './statistik/+page.server';

// Thin web routes over the shared workflows, on the test application layer.
const mocks = {
	find: vi.fn(),
	findOne: vi.fn(),
	aggregate: vi.fn(),
	limit: vi.fn(),
	clear: vi.fn()
};
let world: TestWorld;
let restore: () => Promise<void>;

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	mocks.find.mockReset().mockReturnValue({ toArray: async () => [] });
	mocks.findOne.mockReset().mockResolvedValue(null);
	mocks.aggregate.mockReset().mockReturnValue({ next: async () => null });
	mocks.limit.mockReset().mockResolvedValue({
		attempts: 1,
		windowStart: new Date(),
		blockedUntil: null,
		lastAllowed: true
	});
	mocks.clear.mockReset().mockResolvedValue({});
	world = makeTestWorld({
		usernames: ['current'],
		passwords: { current: 'testpass123' },
		reviews: [
			createExistingReview({
				slug: 'utkast',
				publicationStatus: 'draft',
				changeLog: [
					{ updatedAt: new Date(1), updatedBy: 'a', changes: [] },
					{ updatedAt: new Date(2), updatedBy: 'b', changes: [] }
				] as never
			})
		]
	});
	restore = useTestApp(world, {
		collections: {
			bars: { find: mocks.find, findOne: mocks.findOne, aggregate: mocks.aggregate } as never,
			mapGeocodes: { find: mocks.find } as never,
			loginRateLimits: { findOneAndUpdate: mocks.limit, deleteOne: mocks.clear } as never
		}
	});
});
afterEach(async () => {
	vi.restoreAllMocks();
	await restore();
});

describe('review history page', () => {
	it('shows the newest change first to reviewers and hides drafts from visitors', async () => {
		const event = (user: { username: string } | null, slug = 'utkast') =>
			webEvent<Parameters<typeof historyLoad>[0]>({
				url: `/${slug}/history`,
				user,
				params: { slug }
			});
		const result = await historyLoad(event({ username: 'current' }));
		expect(result?.history.map((entry) => entry.updatedBy)).toEqual(['b', 'a']);
		await expect(historyLoad(event(null))).rejects.toMatchObject({ status: 404 });
		await expect(historyLoad(event(null, '%E0%A4%A'))).rejects.toMatchObject({ status: 404 });
	});
});

describe('admin review list', () => {
	it('redirects visitors and lists active reviews for reviewers', async () => {
		const event = (user: { username: string } | null) =>
			webEvent<Parameters<typeof adminLoad>[0]>({ url: '/admin/reviews', user });
		await expect(adminLoad(event(null))).rejects.toMatchObject({ status: 302, location: '/login' });
		const result = await adminLoad(event({ username: 'current' }));
		expect(result?.bars.map((bar) => bar.slug)).toEqual(['utkast']);
	});
});

describe('public statistics and map pages', () => {
	it('load the shared cached views', async () => {
		const statistics = await statisticsLoad(
			webEvent<Parameters<typeof statisticsLoad>[0]>({ url: '/statistik' })
		);
		expect(statistics).toMatchObject({ statistics: { totalReviews: 0 } });
		const map = await mapLoad(
			webEvent<Parameters<typeof mapLoad>[0]>({ url: '/karta?attributes=darts&attributes=x' })
		);
		expect(map).toMatchObject({ attributes: ['darts'], map: { markers: [] } });
	});

	it('lets only same-origin reviewers resolve the next marker', async () => {
		const event = (user: { username: string } | null, origin = 'http://localhost') =>
			webEvent<Parameters<typeof nextMarker>[0]>({
				url: '/karta/next-marker',
				method: 'POST',
				user,
				headers: { origin }
			});
		await expect(nextMarker(event(null))).rejects.toMatchObject({ status: 401 });
		await expect(
			nextMarker(event({ username: 'current' }, 'https://evil.example'))
		).rejects.toMatchObject({ status: 403 });
		expect((await nextMarker(event({ username: 'current' }))).status).toBe(204);
	});
});

describe('image route', () => {
	it('answers unknown and unauthorized images with an uncached 404', async () => {
		for (const filename of ['../secret.png', '6a1e9d487d43112acf4a0c36.png']) {
			const response = await imageGet(
				webEvent<Parameters<typeof imageGet>[0]>({
					url: `/images/${filename}`,
					params: { filename }
				})
			);
			expect(response.status).toBe(404);
			expect(response.headers.get('cache-control')).toBe('no-store');
		}
	});
});

describe('login action', () => {
	const event = (username: string, password: string) => {
		const input = webEvent<Parameters<typeof loginActions.login>[0]>({
			url: '/login?/login',
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ username, password })
		});
		input.cookies.set = vi.fn();
		return input;
	};

	it('sets the session cookie and redirects on valid credentials', async () => {
		const input = event('current', 'testpass123');
		await expect(loginActions.login(input)).rejects.toMatchObject({
			status: 302,
			location: '/admin/reviews'
		});
		expect(input.cookies.set).toHaveBeenCalledWith(
			'auth_session',
			'session-id-current',
			expect.objectContaining({ path: '.' })
		);
	});

	it('answers wrong credentials with a Swedish 400 and no cookie', async () => {
		const input = event('current', 'wrongpass1');
		const result = await loginActions.login(input);
		expect(result).toMatchObject({ status: 400, data: { message: expect.any(String) } });
		expect(input.cookies.set).not.toHaveBeenCalled();
		expect(world.audits.at(-1)).toMatchObject({ outcome: 'failure' });
	});
});
