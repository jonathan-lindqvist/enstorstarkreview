import type { Filter, UpdateFilter } from 'mongodb';
import { isDuplicateKeyError } from '$lib/server/reviews/errors';
import type { PushDevice } from '$lib/types/push-device';
import type { PushDeviceUpsert } from './devices';

interface PushDeviceCollection {
	updateOne(
		filter: Filter<PushDevice>,
		update: UpdateFilter<PushDevice>,
		options: { upsert: true }
	): Promise<unknown>;
	deleteMany(filter: Filter<PushDevice>): Promise<unknown>;
	find(filter: Filter<PushDevice>): { toArray(): Promise<PushDevice[]> };
}

export const createPushDeviceStore = (collection: PushDeviceCollection) => {
	const upsert = (device: PushDeviceUpsert, now: Date) => {
		const { token, platform, apnsEnvironment, username } = device;
		const unset = {
			...(apnsEnvironment === null ? { apnsEnvironment: '' as const } : {}),
			...(username === null ? { username: '' as const } : {})
		};
		return collection.updateOne(
			{ token },
			{
				$set: {
					platform,
					...(apnsEnvironment === null ? {} : { apnsEnvironment }),
					...(username === null ? {} : { username }),
					updatedAt: now
				},
				...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
				$setOnInsert: { token, createdAt: now }
			},
			{ upsert: true }
		);
	};

	const removeDevices = async (tokens: string[]): Promise<void> => {
		if (tokens.length === 0) return;
		await collection.deleteMany({ token: { $in: tokens } });
	};

	return {
		async upsertDevice(device: PushDeviceUpsert, now: Date): Promise<void> {
			try {
				await upsert(device, now);
			} catch (error) {
				// Two first registrations of one token can race to insert; the loser updates.
				if (!isDuplicateKeyError(error)) throw error;
				await upsert(device, now);
			}
		},
		/** Anonymous devices have no username, so `$nin` includes them. */
		findRecipients: (excludedUsernames: string[]): Promise<PushDevice[]> =>
			collection.find({ username: { $nin: excludedUsernames } }).toArray(),
		removeDevices,
		removeDevice: removeDevices
	};
};
