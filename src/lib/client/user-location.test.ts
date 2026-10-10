import { describe, expect, it, vi } from 'vitest';
import { watchUserLocation } from './user-location';

const setup = () => {
	let success!: PositionCallback;
	let failure!: PositionErrorCallback;
	const geolocation = {
		watchPosition: vi.fn((onPosition: PositionCallback, onError?: PositionErrorCallback | null) => {
			success = onPosition;
			failure = onError!;
			return 73;
		}),
		clearWatch: vi.fn()
	};
	const onChange = vi.fn();
	const stop = watchUserLocation(onChange, geolocation);
	const emit = (latitude = 57.72, longitude = 12.03, accuracy = 80) =>
		success({ coords: { latitude, longitude, accuracy } } as GeolocationPosition);
	const error = (code: number) => failure({ code } as GeolocationPositionError);
	return { geolocation, onChange, stop, emit, error };
};

describe('browser-only user location', () => {
	it('uses the existing balanced options and emits only needed position fields', () => {
		const { geolocation, onChange, emit } = setup();
		expect(geolocation.watchPosition).toHaveBeenCalledWith(
			expect.any(Function),
			expect.any(Function),
			{
				enableHighAccuracy: false,
				maximumAge: 15_000,
				timeout: 10_000
			}
		);
		emit();
		expect(onChange).toHaveBeenLastCalledWith({
			position: { latitude: 57.72, longitude: 12.03, accuracy: 80 },
			error: null
		});
	});
	it('clears position on denial and recovers on a later valid fix', () => {
		const { onChange, emit, error } = setup();
		emit();
		error(1);
		expect(onChange).toHaveBeenLastCalledWith({
			position: null,
			error: expect.stringContaining('Platsåtkomst nekades')
		});
		emit();
		expect(onChange.mock.lastCall?.[0].position).not.toBeNull();
		expect(onChange.mock.lastCall?.[0].error).toBeNull();
	});
	it('handles invalid fixes, unavailable positions and timeouts without throwing', () => {
		const { onChange, emit, error } = setup();
		for (const code of [2, 3]) {
			error(code);
			expect(onChange).toHaveBeenLastCalledWith({
				position: null,
				error: 'Din position kunde inte hämtas just nu.'
			});
		}
		emit(91);
		expect(onChange.mock.lastCall?.[0].position).toBeNull();
		emit(57.72, 12.03, NaN);
		expect(onChange.mock.lastCall?.[0].position.accuracy).toBe(0);
	});
	it('clears the watch once and ignores late callbacks after disposal', () => {
		const { geolocation, onChange, emit, error, stop } = setup();
		stop();
		stop();
		emit();
		error(1);
		expect(geolocation.clearWatch).toHaveBeenCalledExactlyOnceWith(73);
		expect(onChange).not.toHaveBeenCalled();
	});
	it('reports unsupported geolocation or a synchronous browser failure', () => {
		const onChange = vi.fn();
		expect(watchUserLocation(onChange, undefined)).toBeTypeOf('function');
		expect(onChange).toHaveBeenLastCalledWith({
			position: null,
			error: 'Din position kunde inte hämtas just nu.'
		});
		watchUserLocation(onChange, {
			watchPosition: () => {
				throw new Error('browser failure');
			},
			clearWatch: vi.fn()
		});
		expect(onChange).toHaveBeenCalledTimes(2);
	});
});
