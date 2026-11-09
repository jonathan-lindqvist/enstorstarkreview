import { describe, expect, it, vi } from 'vitest';
import { createPushDeviceStore } from './persistence';

const now = new Date('2026-11-09T12:00:00.000Z');

const createCollection = () => ({
	updateOne: vi.fn(async () => ({})),
	deleteMany: vi.fn(async () => ({})),
	find: vi.fn(() => ({ toArray: async () => [] }))
});

describe('push device store', () => {
	it('upserts by token, keeping the first registration time', async () => {
		const collection = createCollection();
		await createPushDeviceStore(collection).upsertDevice(
			{ token: 'abc', platform: 'ios', apnsEnvironment: 'sandbox', username: 'alice' },
			now
		);
		expect(collection.updateOne).toHaveBeenCalledWith(
			{ token: 'abc' },
			{
				$set: { platform: 'ios', apnsEnvironment: 'sandbox', username: 'alice', updatedAt: now },
				$setOnInsert: { token: 'abc', createdAt: now }
			},
			{ upsert: true }
		);
	});

	it('removes the user and environment a device no longer has', async () => {
		const collection = createCollection();
		await createPushDeviceStore(collection).upsertDevice(
			{ token: 'abc', platform: 'android', apnsEnvironment: null, username: null },
			now
		);
		expect(collection.updateOne).toHaveBeenCalledWith(
			{ token: 'abc' },
			{
				$set: { platform: 'android', updatedAt: now },
				$unset: { apnsEnvironment: '', username: '' },
				$setOnInsert: { token: 'abc', createdAt: now }
			},
			{ upsert: true }
		);
	});

	it('retries once when a parallel registration inserted the same token first', async () => {
		const collection = createCollection();
		collection.updateOne.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
		await createPushDeviceStore(collection).upsertDevice(
			{ token: 'abc', platform: 'android', apnsEnvironment: null, username: null },
			now
		);
		expect(collection.updateOne).toHaveBeenCalledTimes(2);
	});

	it('finds every device except those of the given users, anonymous ones included', async () => {
		const collection = createCollection();
		await createPushDeviceStore(collection).findRecipients(['alice', 'bob']);
		expect(collection.find).toHaveBeenCalledWith({ username: { $nin: ['alice', 'bob'] } });
	});

	it('removes devices by token and skips an empty list', async () => {
		const collection = createCollection();
		const store = createPushDeviceStore(collection);
		await store.removeDevices(['abc', 'def']);
		await store.removeDevices([]);
		expect(collection.deleteMany).toHaveBeenCalledTimes(1);
		expect(collection.deleteMany).toHaveBeenCalledWith({ token: { $in: ['abc', 'def'] } });
	});
});
