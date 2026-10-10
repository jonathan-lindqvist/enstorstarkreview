import { describe, expect, it, vi } from 'vitest';
import { createResolvedCoordinatesLoader } from './coordinates';

describe('read-only saved coordinates', () => {
	it('looks up only supplied normalized addresses and returns valid resolved coordinates', async () => {
		const find = vi.fn(() => ({
			toArray: async () => [
				{
					addressKey: 'måsgatan 4',
					status: 'resolved',
					latitude: 57.72,
					longitude: 12.03,
					address: 'private metadata'
				},
				{ addressKey: 'felgatan 1', status: 'resolved', latitude: 100, longitude: 12 },
				{ addressKey: 'saknas 1', status: 'failed', latitude: 57, longitude: 12 },
				{ addressKey: 'annan 1', status: 'resolved', latitude: 57, longitude: 12 }
			]
		}));
		const load = createResolvedCoordinatesLoader({ find });
		const result = await load([' MÅSgatan\u0000  4 ', 'måsgatan 4', 'Felgatan 1', 'Saknas 1', '']);
		expect(find).toHaveBeenCalledExactlyOnceWith(
			{ addressKey: { $in: ['måsgatan 4', 'felgatan 1', 'saknas 1'] }, status: 'resolved' },
			{ projection: { _id: 0, addressKey: 1, status: 1, latitude: 1, longitude: 1 } }
		);
		expect([...result]).toEqual([['måsgatan 4', { latitude: 57.72, longitude: 12.03 }]]);
	});
	it('does no work for empty addresses and propagates dependency failures', async () => {
		const find = vi.fn(() => {
			throw new Error('database offline');
		});
		const load = createResolvedCoordinatesLoader({ find });
		expect(await load(['', ' '])).toEqual(new Map());
		expect(find).not.toHaveBeenCalled();
		await expect(load(['Gatan 1'])).rejects.toThrow('database offline');
	});
});
