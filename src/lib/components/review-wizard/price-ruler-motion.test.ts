import { describe, expect, it } from 'vitest';
import { PriceRulerMotion, releaseVelocity } from './price-ruler-motion';

const range = { min: 1, max: 200 };

describe('PriceRulerMotion', () => {
	it('clamps the starting value and falls back to the minimum for non-finite input', () => {
		expect(new PriceRulerMotion(500, range).position).toBe(200);
		expect(new PriceRulerMotion(Number.NaN, range).position).toBe(1);
	});

	it('drags continuously but selects the nearest whole krona', () => {
		const motion = new PriceRulerMotion(70, range);
		motion.drag(72.4);
		expect(motion.position).toBe(72.4);
		expect(motion.selected).toBe(72);
		motion.drag(-10);
		expect(motion.selected).toBe(1);
	});

	it('coasts after a fling and comes to rest on a whole krona', () => {
		const motion = new PriceRulerMotion(70, range);
		motion.release(40, false);
		expect(motion.isMoving).toBe(true);
		for (let i = 0; i < 120 && motion.isMoving; i++) motion.advance(1 / 60);
		expect(motion.isMoving).toBe(false);
		expect(motion.position).toBeGreaterThan(74);
		expect(Number.isInteger(motion.position)).toBe(true);
	});

	it('travels the same distance regardless of frame rate', () => {
		const smooth = new PriceRulerMotion(70, range);
		const choppy = new PriceRulerMotion(70, range);
		smooth.release(40, false);
		choppy.release(40, false);
		for (let i = 0; i < 30; i++) smooth.advance(1 / 60);
		for (let i = 0; i < 5; i++) choppy.advance(0.1);
		expect(smooth.position).toBeCloseTo(choppy.position, 6);
	});

	it('does not coast with reduced motion, slow releases, or invalid samples', () => {
		for (const [velocity, reduce] of [
			[40, true],
			[2, false],
			[Number.POSITIVE_INFINITY, false],
			[Number.NaN, false]
		] as const) {
			const motion = new PriceRulerMotion(70.4, range);
			motion.release(velocity, reduce);
			expect(motion.isMoving).toBe(false);
			expect(motion.position).toBe(70);
		}
	});

	it('caps fling speed so travel stays bounded', () => {
		const motion = new PriceRulerMotion(1, { min: 1, max: 10_000 });
		motion.release(1e9, false);
		for (let i = 0; i < 600 && motion.isMoving; i++) motion.advance(1 / 60);
		expect(motion.position).toBeLessThanOrEqual(1 + 300 / 6);
	});

	it('stops at either end of the range', () => {
		const motion = new PriceRulerMotion(198, range);
		motion.release(200, false);
		for (let i = 0; i < 60 && motion.isMoving; i++) motion.advance(1 / 60);
		expect(motion.isMoving).toBe(false);
		expect(motion.position).toBe(200);

		const atStart = new PriceRulerMotion(1, range);
		atStart.release(-50, false);
		expect(atStart.isMoving).toBe(false);
	});

	it('ignores non-positive or non-finite frame times', () => {
		const motion = new PriceRulerMotion(70, range);
		motion.release(40, false);
		motion.advance(0);
		motion.advance(-1);
		motion.advance(Number.NaN);
		expect(motion.position).toBe(70);
	});
});

describe('releaseVelocity', () => {
	it('measures recent pointer movement in krona per second', () => {
		// The ruler moves opposite to the finger: dragging left raises the price.
		const samples = [
			{ x: 300, t: 0 },
			{ x: 250, t: 50 },
			{ x: 200, t: 100 }
		];
		expect(releaseVelocity(samples, 100, 10)).toBeCloseTo(100);
	});

	it('is zero when the finger paused before lifting or there are too few samples', () => {
		expect(
			releaseVelocity(
				[
					{ x: 300, t: 0 },
					{ x: 200, t: 50 }
				],
				400,
				10
			)
		).toBe(0);
		expect(releaseVelocity([{ x: 300, t: 0 }], 0, 10)).toBe(0);
	});
});
