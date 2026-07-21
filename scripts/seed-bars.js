#!/usr/bin/env node
// Seed the database with random demo bars: node scripts/seed-bars.js [count] [--fresh]
// Images go to REVIEW_IMAGE_DIR, else /app/uploads/images in prod, else static/images.

import { MongoClient, ObjectId } from 'mongodb';
import { copyFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const IMAGE = fileURLToPath(new URL('../src/lib/images/image.png', import.meta.url));
const IMAGE_DIR =
	process.env.REVIEW_IMAGE_DIR ||
	(process.env.NODE_ENV === 'production' ? '/app/uploads/images' : 'static/images');

const PLACES = ['Söders', 'Vasastans', 'Kungsholmens', 'Norrmalms', 'Östermalms', 'Slussens'];
const TYPES = ['Krog', 'Ölhall', 'Pub', 'Källare', 'Bryggeri', 'Skänk'];
const STREETS = ['Bondegatan', 'Hornsgatan', 'Götgatan', 'Sveavägen', 'Odengatan'];
// Metrics and weights kept in sync with src/lib/review-metadata.ts (soundLevel: 0=loud, 5=quiet).
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

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const int = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a))) || 20;

mkdirSync(IMAGE_DIR, { recursive: true });
const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');
await client.connect();
const bars = client.db('enstorstark').collection('bars');
const author =
	(
		await client
			.db('enstorstark')
			.collection('users')
			.findOne({}, { sort: { _id: 1 } })
	)?.username ?? 'test';

if (args.includes('--fresh')) await bars.deleteMany({});

const now = Date.now();
let created = 0;
for (let i = 0; i < count; i++) {
	const title = `${pick(PLACES)} ${pick(TYPES)}`;
	const values = METRICS.map((m) => int(m === 'soundLevel' ? 1 : 2, 5));
	const weighted = values.reduce((sum, v, j) => sum + v * WEIGHTS[j], 0);
	const image = `${new ObjectId().toHexString()}.png`;
	const at = new Date(now - i * 3600_000); // stagger so latest/oldest sort has an order
	const bar = {
		_id: new ObjectId(),
		title,
		slug: title.toLowerCase().replaceAll(' ', '-'),
		description: 'En trevlig bar med kall öl och skön stämning.',
		location: `${pick(STREETS)} ${int(1, 140)}, Stockholm`,
		...Object.fromEntries(METRICS.map((m, j) => [m, values[j]])),
		rating: weighted >= 4.5 ? 3 : weighted >= 3.25 ? 2 : weighted >= 2 ? 1 : 0,
		image,
		imageFocusX: 50,
		imageFocusY: 50,
		beerPriceKr: int(55, 89),
		isHappyHourPrice: Math.random() < 0.4,
		author,
		coAuthors: [],
		changeLog: [],
		createdAt: at,
		updatedAt: at
	};
	try {
		await bars.insertOne(bar);
	} catch (err) {
		if (err?.code === 11000) continue; // slug already taken, skip
		throw err;
	}
	copyFileSync(IMAGE, `${IMAGE_DIR}/${image}`); // write image only after the row commits
	created++;
}

console.log(`✓ Seeded ${created} bar(s) as "${author}". Images in ${IMAGE_DIR}`);
await client.close();
