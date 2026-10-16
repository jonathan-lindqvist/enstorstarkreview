#!/usr/bin/env node
// Seed the database with random demo bars: node scripts/seed-bars.js [count] [--fresh]
// Development only. Images go to REVIEW_IMAGE_DIR, else uploads/images.

import { MongoClient, ObjectId } from 'mongodb';
import { copyFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

if (process.env.NODE_ENV === 'production') {
	console.error('✗ Demo bar seeding is disabled when NODE_ENV=production.');
	process.exit(1);
}

const IMAGE = fileURLToPath(new URL('../src/lib/images/image.png', import.meta.url));
const IMAGE_DIR = process.env.REVIEW_IMAGE_DIR || 'uploads/images';

const TYPES = ['Krog', 'Ölhall', 'Pub', 'Källare', 'Bryggeri', 'Skänk'];
const AREAS = [
	{ name: 'Majornas', street: 'Karl Johansgatan', city: 'Göteborg' },
	{ name: 'Linnés', street: 'Andra Långgatan', city: 'Göteborg' },
	{ name: 'Vasastans', street: 'Vasagatan', city: 'Göteborg' },
	{ name: 'Hagas', street: 'Haga Nygata', city: 'Göteborg' },
	{ name: 'Mölndals', street: 'Göteborgsvägen', city: 'Mölndal' },
	{ name: 'Söders', street: 'Bondegatan', city: 'Stockholm' }
];
const DESCRIPTIONS = [
	'En liten kvartersbar med kall lager och plats för ett samtal. Lugnt tidigt på kvällen, livligare efter nio.',
	'## Kvällens intryck\n\nSnabb service och en välskött stor stark. Musiken hörs, men det går fortfarande att prata.\n\n- Gott om sittplatser\n- Nära till nästa stopp på barrundan',
	'Vi stannade för en öl på vägen hem. Trevligt bemötande, men ganska trångt runt bardisken.',
	'Rymlig lokal med biljard och ett blandat ölsortiment. En bra plats för ett större sällskap.',
	'Billig öl och enkel inredning. Det är stämningen och sällskapet som gör kvällen här.',
	'Litet ställe med få bord. Ölen var kall och servicen vänlig.'
];
const DAY_MS = 86_400_000;
const VOLUMES_CL = [50, 40, 50, 33, 50, 40];
/** @type {import('../src/lib/types/bar-attributes').BarAttributeKey[][]} */
const ATTRIBUTE_SETS = [
	[],
	['quiz', 'boardGames'],
	['sportsTv'],
	['liveMusic', 'darts'],
	['billiards', 'shuffleboard'],
	['karaoke']
];
// Keep this development-only list in sync with src/lib/beer-brands.ts.
const BEER_BRANDS = [
	'Norrlands Guld Export',
	'Falcon Export',
	'Mariestads Export',
	'Pripps Blå Export',
	'Eriksberg Original',
	'Eriksberg Karaktär',
	'Åbro Original',
	'Sofiero Original',
	'Spendrups Premium Gold',
	'Carlsberg Export',
	'Heineken',
	'Staropramen',
	'Grängesberg',
	'Ey’Bro',
	'Melleruds Utmärkta Pilsner'
];
// Metrics and weights kept in sync with src/lib/review-metadata.ts (soundLevel: 0=loud, 5=quiet).
/** @type {import('../src/lib/types/bar-review').ReviewRatingKey[]} */
const METRICS = [
	'atmosphere',
	'service',
	'selection',
	'quality',
	'price',
	'cleanliness',
	'soundLevel',
	'barhopPotential'
];
const WEIGHTS = [0.18, 0.14, 0.1, 0.18, 0.07, 0.12, 0.03, 0.18];

/** @template T @param {T[]} a */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
/** @param {number} min @param {number} max */
const int = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a))) || 20;

mkdirSync(IMAGE_DIR, { recursive: true });
const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');

try {
	await client.connect();
	const db = client.db('enstorstark');
	const bars = db.collection('bars');
	const existingUser = await db.collection('users').findOne({}, { sort: { _id: 1 } });

	if (!existingUser) {
		throw new Error(
			'No users found. Initialize the development database or create a user before seeding bars.'
		);
	}

	const author = existingUser.username;

	if (args.includes('--fresh')) await bars.deleteMany({});

	const now = Date.now();
	for (let i = 0; i < count; i++) {
		// Each ten reviews contain six complete, one unknown-volume and three legacy records.
		// Cycling coverage avoids accidentally seeding only one kind of review in a small batch.
		const profile = i % 10;
		const legacy = profile >= 7;
		const area = AREAS[i % AREAS.length];
		const title = `${area.name} ${pick(TYPES)}`;
		const base = title.toLowerCase().replaceAll(' ', '-');
		const level = i % 5;
		const values = METRICS.map(() => (level === 4 ? 5 : int(level, level + 1)));
		const ratings = /** @type {import('../src/lib/types/bar-review').ReviewRatingValues} */ (
			Object.fromEntries(METRICS.map((m, j) => [m, values[j]]))
		);
		const weighted = values.reduce((sum, v, j) => sum + v * WEIGHTS[j], 0);
		const image = `${new ObjectId().toHexString()}.png`;
		const ageDays = legacy ? 365 + (i + 1) * 21 : i * 7;
		const at = new Date(now - ageDays * DAY_MS);
		const updatedAt = new Date(at.getTime() + (profile === 1 ? 2 * DAY_MS : 0));
		const isHappyHourPrice = profile === 2 || profile === 4;
		const beerPriceKr = isHappyHourPrice ? int(29, 55) : int(45, 110);
		/** @type {import('../src/lib/types/bar-review').BarReview} */
		const bar = {
			_id: new ObjectId(),
			title,
			slug: base,
			description: DESCRIPTIONS[i % DESCRIPTIONS.length],
			location: `${area.street} ${int(1, 80)}, ${area.city}`,
			...ratings,
			rating: weighted >= 4.5 ? 3 : weighted >= 3.25 ? 2 : weighted >= 2 ? 1 : 0,
			image,
			author,
			createdAt: at,
			updatedAt
		};
		if (!legacy) {
			bar.beerBrand = profile === 3 || profile === 6 ? 'Husets lager' : pick(BEER_BRANDS);
			bar.beerPriceKr = beerPriceKr;
			bar.beerVolumeCl = profile === 6 ? null : VOLUMES_CL[profile];
			bar.isHappyHourPrice = isHappyHourPrice;
			bar.attributes = [...ATTRIBUTE_SETS[profile % ATTRIBUTE_SETS.length]];
			bar.imageFocusX = int(25, 75);
			bar.imageFocusY = int(25, 75);
			bar.coAuthors = [];
			bar.publicationStatus = profile === 5 ? 'draft' : 'published';
			bar.changeLog =
				profile === 1
					? [
							{
								updatedAt,
								updatedBy: author,
								changes: [
									{
										field: 'beerPriceKr',
										label: 'Pris för en stor stark',
										before: `${beerPriceKr - 5} kr`,
										after: `${beerPriceKr} kr`
									}
								]
							}
						]
					: [];
		} else {
			// Truly absent fields exercise legacy fallbacks; unknown volume is never assumed to be 50 cl.
			if (profile === 7) bar.beerBrand = BEER_BRANDS[0];
			if (profile !== 9) bar.beerPriceKr = beerPriceKr;
		}
		// Retry with a numeric suffix until the slug is unique, so N requested == N created.
		for (let n = 1; ; n++) {
			bar.slug = n === 1 ? base : `${base}-${n}`;
			try {
				await bars.insertOne(bar);
				break;
			} catch (err) {
				if (!err || typeof err !== 'object' || !('code' in err) || err.code !== 11000) throw err;
			}
		}
		copyFileSync(IMAGE, `${IMAGE_DIR}/${image}`); // write image only after the row commits
	}

	console.log(`✓ Seeded ${count} bar(s) as "${author}". Images in ${IMAGE_DIR}`);
} catch (error) {
	console.error(
		`✗ Could not seed demo bars: ${error instanceof Error ? error.message : String(error)}`
	);
	process.exitCode = 1;
} finally {
	await client.close();
}
