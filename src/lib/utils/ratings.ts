export function calculateOverallRating(values: number[]): number {
	// [atmosphere, service, selection, quality, price, cleanliness, soundLevel, barhopPotential]
	const weights = [0.18, 0.14, 0.1, 0.18, 0.07, 0.12, 0.03, 0.18];

	const weighted = values.reduce((sum, value, i) => sum + value * weights[i], 0);

	if (weighted >= 4.5) return 3;
	if (weighted >= 3.25) return 2;
	if (weighted >= 2) return 1;
	return 0;
}
