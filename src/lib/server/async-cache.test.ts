import { describe, expect, it, vi } from 'vitest';
import { createAsyncCache } from './async-cache';

describe('async cache', () => {
	it('shares pending reads and expires relative to completion', async () => {
		let now = 0;
		let resolve!: (value: number) => void;
		const load = vi.fn(
			() =>
				new Promise<number>((done) => {
					resolve = done;
				})
		);
		const cache = createAsyncCache({ load, ttlMs: 10, now: () => now });
		const first = cache.get();
		const second = cache.get();
		expect(load).toHaveBeenCalledTimes(1);
		now = 20;
		resolve(1);
		expect(await Promise.all([first, second])).toEqual([1, 1]);
		now = 29;
		expect(await cache.get()).toBe(1);
		now = 30;
		const next = cache.get();
		resolve(2);
		expect(await next).toBe(2);
	});
	it('does not replace a new generation with an older result or clear its pending read', async () => {
		const resolvers: Array<(value: number) => void> = [];
		const load = vi.fn(() => new Promise<number>((done) => resolvers.push(done)));
		const cache = createAsyncCache({ load, ttlMs: 100 });
		const old = cache.get();
		cache.invalidate();
		const current = cache.get();
		resolvers[0](1);
		expect(await old).toBe(1);
		const concurrent = cache.get();
		expect(load).toHaveBeenCalledTimes(2);
		resolvers[1](2);
		expect(await current).toBe(2);
		expect(await concurrent).toBe(2);
		expect(await cache.get()).toBe(2);
	});
	it('allows a new read after rejection', async () => {
		const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(2);
		const cache = createAsyncCache<number>({ load, ttlMs: 100 });
		await expect(cache.get()).rejects.toThrow('offline');
		expect(await cache.get()).toBe(2);
	});
});
