export function calculateOverallRating(values: number[]): number {
	const avg = values.reduce((a, b) => a + b, 0) / values.length;
	return Math.min(3, Math.floor(avg));
}
