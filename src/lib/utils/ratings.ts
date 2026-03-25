export function calculateOverallRating(values: number[]): number {
	// [atmosphere, service, selection, quality, price, cleanliness, soundLevel, barhopPotential]
	const weights = [0.18, 0.14, 0.1, 0.18, 0.07, 0.12, 0.03, 0.18];

	const weighted = values.reduce((sum, value, i) => sum + value * weights[i], 0);
	// Floor to 0-3 range: 0.0-0.9=0, 1.0-1.9=1, 2.0-2.9=2, 3.0+=3
	return Math.min(3, Math.floor(weighted));
}
