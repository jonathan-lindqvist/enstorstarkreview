import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import { BAR_ATTRIBUTES } from '$lib/bar-attributes';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import { calculateOverallRating } from '$lib/utils/ratings';

const mocks = vi.hoisted(() => ({
	connect: vi.fn(),
	close: vi.fn(),
	findUser: vi.fn(),
	insert: vi.fn(),
	deleteBars: vi.fn(),
	copyImage: vi.fn(),
	mkdir: vi.fn()
}));

vi.mock('mongodb', async (importOriginal) => ({
	...(await importOriginal<typeof import('mongodb')>()),
	MongoClient: class {
		connect = mocks.connect;
		close = mocks.close;
		db = () => ({
			collection: (name: string) =>
				name === 'users'
					? { findOne: mocks.findUser }
					: { insertOne: mocks.insert, deleteMany: mocks.deleteBars }
		});
	}
}));

vi.mock('fs', async (importOriginal) => ({
	...(await importOriginal<typeof import('fs')>()),
	copyFileSync: mocks.copyImage,
	mkdirSync: mocks.mkdir
}));

const runSeeder = async (...args: string[]) => {
	const originalArgs = process.argv;
	const originalExitCode = process.exitCode;
	try {
		process.argv = ['node', 'scripts/seed-bars.js', ...args];
		await import('../../../scripts/seed-bars.js');
	} finally {
		process.argv = originalArgs;
		process.exitCode = originalExitCode;
	}
};

describe('seed-bars script', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.resetAllMocks();
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('MONGO_URI', 'mongodb://127.0.0.1:1/enstorstark');
		vi.stubEnv('REVIEW_IMAGE_DIR', '/tmp/enstorstarkreview-seed-tests');
		mocks.findUser.mockResolvedValue({ username: 'demo-author' });
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('refuses to run in production before connecting to MongoDB', () => {
		const result = spawnSync(
			process.execPath,
			[resolve(process.cwd(), 'scripts/seed-bars.js'), '1'],
			{
				cwd: process.cwd(),
				encoding: 'utf8',
				env: {
					...process.env,
					NODE_ENV: 'production',
					MONGO_URI: 'mongodb://127.0.0.1:1/enstorstark?serverSelectionTimeoutMS=100'
				},
				timeout: 5000
			}
		);

		expect(result.status).toBe(1);
		expect(result.signal).toBeNull();
		expect(result.stderr).toContain('Demo bar seeding is disabled when NODE_ENV=production.');
	});

	it('seeds a guaranteed mix of complete, partially documented and legacy reviews', async () => {
		await runSeeder();
		const reviews = mocks.insert.mock.calls.map(([review]) => review as BarReview);
		expect(reviews).toHaveLength(20);
		expect(reviews.filter((review) => typeof review.beerVolumeCl === 'number')).toHaveLength(12);
		expect(reviews.filter((review) => review.beerVolumeCl === null)).toHaveLength(2);
		expect(reviews.filter((review) => !('beerVolumeCl' in review))).toHaveLength(6);
		expect(reviews.filter((review) => review.publicationStatus === 'draft')).toHaveLength(2);
		const legacy = reviews.filter((review) => !('publicationStatus' in review));
		expect(legacy).toHaveLength(6);
		expect(legacy.every((review) => !('attributes' in review) && !('coAuthors' in review))).toBe(
			true
		);
		expect(reviews.some((review) => !('beerBrand' in review))).toBe(true);
		expect(reviews.some((review) => !('beerPriceKr' in review))).toBe(true);
		expect(reviews.some((review) => review.isHappyHourPrice === true)).toBe(true);
		expect(reviews.some((review) => review.isHappyHourPrice === false)).toBe(true);
		expect(reviews.some((review) => review.beerBrand === 'Husets lager')).toBe(true);
		expect(reviews.some((review) => review.attributes?.length)).toBe(true);
		expect(reviews.some((review) => review.attributes?.length === 0)).toBe(true);
		expect(reviews.some((review) => review.location.includes('Göteborg'))).toBe(true);
		expect(reviews.some((review) => !review.location.includes('Göteborg'))).toBe(true);
		expect(new Set(reviews.map((review) => review.description)).size).toBeGreaterThan(1);
		expect(
			legacy.every((review) => review.createdAt.getTime() < Date.now() - 365 * 86400_000)
		).toBe(true);
		expect(
			reviews.some((review) => review.changeLog?.length && review.updatedAt > review.createdAt)
		).toBe(true);
		for (const review of reviews) {
			expect(review.author).toBe('demo-author');
			expect(review.createdAt.getTime()).toBeLessThanOrEqual(review.updatedAt.getTime());
			expect(review.updatedAt.getTime()).toBeLessThanOrEqual(Date.now());
			expect(review.rating).toBe(
				calculateOverallRating(REVIEW_RATING_METRICS.map(({ key }) => review[key]))
			);
			expect(
				(review.attributes ?? []).every((key) =>
					BAR_ATTRIBUTES.some((attribute) => attribute.key === key)
				)
			).toBe(true);
			if (typeof review.beerVolumeCl === 'number')
				expect([33, 40, 50]).toContain(review.beerVolumeCl);
			if (review.beerPriceKr !== undefined) {
				expect(Number.isInteger(review.beerPriceKr)).toBe(true);
				expect(review.beerPriceKr).toBeGreaterThan(0);
			}
		}
		expect(mocks.copyImage).toHaveBeenCalledTimes(20);
		expect(mocks.deleteBars).not.toHaveBeenCalled();
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	it('keeps the mix when random choices repeat, retries duplicate slugs and honors the count', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		mocks.insert.mockRejectedValueOnce({ code: 11000 });
		await runSeeder('10');
		expect(mocks.insert).toHaveBeenCalledTimes(11);
		expect(mocks.copyImage).toHaveBeenCalledTimes(10);
		const reviews = mocks.insert.mock.calls.slice(1).map(([review]) => review as BarReview);
		expect(reviews.filter((review) => typeof review.beerVolumeCl === 'number')).toHaveLength(6);
		expect(reviews.filter((review) => !('publicationStatus' in review))).toHaveLength(3);
	});

	it('does not delete existing reviews or write images if no author exists', async () => {
		mocks.findUser.mockResolvedValueOnce(null);
		await runSeeder('10', '--fresh');
		expect(mocks.deleteBars).not.toHaveBeenCalled();
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(mocks.copyImage).not.toHaveBeenCalled();
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	it('preserves explicit fresh mode and stops on non-duplicate database failures', async () => {
		mocks.insert.mockRejectedValueOnce(new Error('Test database unavailable'));
		await runSeeder('10', '--fresh');
		expect(mocks.deleteBars).toHaveBeenCalledOnce();
		expect(mocks.insert).toHaveBeenCalledOnce();
		expect(mocks.copyImage).not.toHaveBeenCalled();
		expect(mocks.close).toHaveBeenCalledOnce();
	});
});
