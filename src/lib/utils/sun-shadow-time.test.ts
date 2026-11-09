import { describe, expect, it } from 'vitest';
import { changeShadowDate, shadowDay, shadowTime } from './sun-shadow-time';

describe('sun map Swedish date and time', () => {
	it('uses Stockholm time regardless of the browser timezone', () => {
		expect(shadowTime(Date.parse('2026-06-21T10:30:00Z'))).toMatchObject({
			date: '2026-06-21',
			time: '12:30',
			minutes: 750
		});
		expect(shadowTime(Date.parse('2026-12-21T10:30:00Z'))).toMatchObject({ time: '11:30' });
	});
	it('gives the slider 23, 24, or 25 hours across daylight saving boundaries', () => {
		expect(shadowDay('2026-03-29')).toEqual({
			start: Date.parse('2026-03-28T23:00:00Z'),
			minutes: 1380
		});
		expect(shadowDay('2026-06-21')?.minutes).toBe(1440);
		expect(shadowDay('2026-10-25')?.minutes).toBe(1500);
		const first = shadowTime(Date.parse('2026-10-25T00:30:00Z'));
		const second = shadowTime(Date.parse('2026-10-25T01:30:00Z'));
		expect(first.time).toBe(second.time);
		expect(first.zone).not.toBe(second.zone);
	});
	it('preserves wall time, choosing the first repeated time or next valid spring time', () => {
		const date = Date.parse('2026-06-21T00:30:00Z');
		expect(changeShadowDate(date, '2026-10-25')).toBe(Date.parse('2026-10-25T00:30:00Z'));
		expect(changeShadowDate(date, '2026-03-29')).toBe(Date.parse('2026-03-29T01:00:00Z'));
		expect(changeShadowDate(Date.parse('2026-06-21T10:30:00Z'), '2026-12-21')).toBe(
			Date.parse('2026-12-21T11:30:00Z')
		);
	});
	it.each(['', '2026-02-30', '2026-13-01', 'not-a-date', '2026-6-1'])(
		'ignores invalid date %j',
		(date) => {
			expect(shadowDay(date)).toBeNull();
			expect(changeShadowDate(Date.now(), date)).toBeNull();
		}
	);
});
