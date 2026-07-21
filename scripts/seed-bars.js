#!/usr/bin/env node

/**
 * Seed the database with random demo bars.
 *
 * Usage: node scripts/seed-bars.js [count] [--fresh]
 *
 * Images go to REVIEW_IMAGE_DIR, or /app/uploads/images in production,
 * otherwise <cwd>/static/images (same rules as src/lib/server/review-images.ts).
 */

import { MongoClient, ObjectId } from 'mongodb';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_IMAGE_PATH = resolve(scriptDir, '..', 'src', 'lib', 'images', 'image.png');

// Kept in sync with src/lib/review-metadata.ts. soundLevel: 0 = loud, 5 = quiet.
const RATING_WEIGHTS = {
	atmosphere: 0.18,
	service: 0.14,
	selection: 0.1,
	quality: 0.18,
	price: 0.07,
	cleanliness: 0.12,
	soundLevel: 0.03,
	barhopPotential: 0.18
};

const PLACES = [
	'Söders',
	'Vasastans',
	'Kungsholmens',
	'Gamla Stans',
	'Norrmalms',
	'Östermalms',
	'Hornstulls',
	'Slussens',
	'Djurgårdens',
	'Liljeholmens'
];
const TYPES = ['Krog', 'Ölhall', 'Pub', 'Källare', 'Bryggeri', 'Taproom', 'Vattenhål', 'Skänk'];
const STREETS = [
	'Bondegatan',
	'Hornsgatan',
	'Götgatan',
	'Karlavägen',
	'Sveavägen',
	'Odengatan',
	'Ringvägen',
	'Kungsgatan'
];
const DESCRIPTIONS = [
	'Mysig kvarterskrog med avslappnad stämning och personal som bryr sig. Ölen håller bra kvalitet för läget.',
	'Stort utbud av lokala mikrobryggerier. Kan bli trångt en fredagskväll men värt det för utbudets skull.',
	'Prisvärt och opretentiöst. Inget märkvärdigt men ärligt, och alltid lätt att hoppa vidare härifrån.'
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Kept in sync with calculateOverallRating in src/lib/utils/ratings.ts.
const overallRating = (ratings) => {
	const weighted = Object.entries(RATING_WEIGHTS).reduce(
		(sum, [key, w]) => sum + ratings[key] * w,
		0
	);
	return weighted >= 4.5 ? 3 : weighted >= 3.25 ? 2 : weighted >= 2 ? 1 : 0;
};

// Kept in sync with generateSlug in src/lib/utils/slug.ts.
const generateSlug = (text) =>
	text
		.toLowerCase()
		.replace(/å|ä/g, 'a')
		.replace(/ö/g, 'o')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/^-+|-+$/g, '');

const imageDir = () => {
	const configured = process.env.REVIEW_IMAGE_DIR?.trim();
	if (configured) return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
	return process.env.NODE_ENV === 'production'
		? '/app/uploads/images'
		: join(process.cwd(), 'static', 'images');
};

const buildBar = (index, author, now) => {
	const ratings = Object.fromEntries(
		Object.keys(RATING_WEIGHTS).map((key) => [key, randInt(key === 'soundLevel' ? 1 : 2, 5)])
	);
	const title = `${rand(PLACES)} ${rand(TYPES)}`;
	// Spread createdAt so the "latest"/"oldest" sort has something to work with.
	const createdAt = new Date(now.getTime() - index * 60 * 60 * 1000);
	return {
		_id: new ObjectId(),
		title,
		description: rand(DESCRIPTIONS),
		...ratings,
		rating: overallRating(ratings),
		image: `${new ObjectId().toHexString()}.png`,
		imageFocusX: 50,
		imageFocusY: 50,
		location: `${rand(STREETS)} ${randInt(1, 140)}, Stockholm`,
		slug: generateSlug(title),
		beerPriceKr: randInt(55, 89),
		isHappyHourPrice: Math.random() < 0.4,
		author,
		coAuthors: [],
		changeLog: [],
		createdAt,
		updatedAt: createdAt
	};
};

async function seedBars() {
	const args = process.argv.slice(2);
	const fresh = args.includes('--fresh');
	const count = Number(args.find((a) => /^\d+$/.test(a))) || 20;

	mkdirSync(imageDir(), { recursive: true });
	const client = new MongoClient(MONGO_URI);

	try {
		await client.connect();
		const db = client.db('enstorstark');
		const bars = db.collection('bars');

		// Reviews reference an author by username; use any existing user.
		const firstUser = await db.collection('users').findOne({}, { sort: { _id: 1 } });
		const author = firstUser?.username ?? 'test';

		if (fresh) await bars.deleteMany({});

		const now = new Date();
		let created = 0;
		for (let i = 0; i < count; i++) {
			const bar = buildBar(i, author, now);
			try {
				await bars.insertOne(bar);
			} catch (err) {
				if (err?.code === 11000) continue; // slug already taken, skip
				throw err;
			}
			// Write the image only after the row is committed, so skips leave no orphans.
			copyFileSync(EXAMPLE_IMAGE_PATH, join(imageDir(), bar.image));
			created++;
			console.log(`  + ${bar.title}  (/${bar.slug})`);
		}

		console.log(`\n✓ Seeded ${created} bar(s) as "${author}". Images in ${imageDir()}`);
	} catch (err) {
		console.error('❌ Seeding failed:', err.message);
		process.exit(1);
	} finally {
		await client.close();
	}
}

seedBars();
