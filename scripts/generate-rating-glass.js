import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const directory = new URL('../static/rating-glass/', import.meta.url);

for (const rating of [1, 2, 3]) {
	for (const width of [128, 256, 512, 768]) {
		await sharp(fileURLToPath(new URL(`${rating}.png`, directory)))
			.resize({ width, withoutEnlargement: true })
			.webp({ lossless: true })
			.toFile(fileURLToPath(new URL(`${rating}-${width}.webp`, directory)));
	}
}
