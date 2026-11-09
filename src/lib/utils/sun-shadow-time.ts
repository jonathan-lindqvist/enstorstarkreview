export const SHADOW_TIME_ZONE = 'Europe/Stockholm';
const formatter = new Intl.DateTimeFormat('sv-SE', {
	timeZone: SHADOW_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
	timeZoneName: 'short'
});

export function shadowTime(timestamp: number) {
	const parts = Object.fromEntries(
		formatter.formatToParts(timestamp).map((part) => [part.type, part.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}`,
		zone: parts.timeZoneName,
		minutes: Number(parts.hour) * 60 + Number(parts.minute)
	};
}

export function shadowDateLabel(timestamp: number, currentTimestamp: number): string {
	const date = shadowTime(timestamp).date;
	const today = shadowTime(currentTimestamp).date;
	if (date === today) return 'Idag';
	const [year, month, day] = date.split('-');
	return `${Number(day)}/${Number(month)}${year === today.slice(0, 4) ? '' : ` ${year}`}`;
}

function midnight(utcDate: number): number {
	let result = utcDate;
	for (let step = 0; step < 3; step++) {
		const local = shadowTime(result);
		const wall = Date.parse(`${local.date}T${local.time}:00Z`);
		result -= wall - utcDate;
	}
	return result;
}

export function shadowDay(date: string): { start: number; minutes: number } | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const utcDate = Date.parse(`${date}T00:00:00Z`);
	if (!Number.isFinite(utcDate) || new Date(utcDate).toISOString().slice(0, 10) !== date)
		return null;
	const start = midnight(utcDate);
	const end = midnight(utcDate + 86_400_000);
	return { start, minutes: (end - start) / 60_000 };
}

export function changeShadowDate(timestamp: number, date: string): number | null {
	const day = shadowDay(date);
	if (!day || !Number.isFinite(timestamp)) return null;
	const wanted = shadowTime(timestamp).minutes;
	for (let minute = 0; minute < day.minutes; minute++) {
		const candidate = day.start + minute * 60_000;
		if (shadowTime(candidate).minutes >= wanted) return candidate;
	}
	return day.start + (day.minutes - 1) * 60_000;
}
