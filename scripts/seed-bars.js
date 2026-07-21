#!/usr/bin/env node

/**
 * Script to seed the database with random demo bar reviews.
 *
 * Creates a batch of bars in one go so a fresh database has something to show.
 * The example image at src/lib/images/image.png is copied into the upload
 * directory once per bar (with a unique ObjectId filename) so every seeded
 * review renders with a picture.
 *
 * Usage:
 *   node scripts/seed-bars.js [count] [--author <username>] [--fresh]
 *
 * The image directory follows the same rules as the app (src/lib/server/review-images.ts):
 *   - REVIEW_IMAGE_DIR if set
 *   - /app/uploads/images when NODE_ENV=production
 *   - <cwd>/static/images otherwise
 */

import { MongoClient, ObjectId } from 'mongodb';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DEFAULT_COUNT = 20;
const DEFAULT_IMAGE_FOCUS = 50;

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
	'Sankt Eriksgatan',
	'Upplandsgatan',
	'Karlavägen',
	'Sveavägen',
	'Odengatan',
	'Ringvägen',
	'Kungsgatan'
];
const DESCRIPTIONS = [
	'Mysig kvarterskrog med avslappnad stämning och personal som bryr sig. Ölen håller bra kvalitet för läget.',
	'Stort utbud av lokala mikrobryggerier. Kan bli trångt en fredagskväll men värt det för utbudets skull.',
	'Prisvärt och opretentiöst. Inget märkvärdigt men ärligt, och alltid lätt att hoppa vidare härifrån.',
	'Sofistikerad ölbar med hög kvalitet rakt igenom. Lite dyrare, men servicen matchar priset.',
	'Anrik lokal med skön akustik och lågmäld stämning. Perfekt för ett långt samtal över en stor stark.'
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Kept in sync with calculateOverallRating in src/lib/utils/ratings.ts.
const calculateOverallRating = (ratings) => {
	const weighted = Object.entries(RATING_WEIGHTS).reduce(
		(sum, [key, weight]) => sum + (ratings[key] ?? 0) * weight,
		0
	);
	if (weighted >= 4.5) return 3;
	if (weighted >= 3.25) return 2;
	if (weighted >= 2) return 1;
	return 0;
};

// Kept in sync with generateSlug in src/lib/utils/slug.ts.
const generateSlug = (text) =>
	text
		.toLowerCase()
		.trim()
		.replace(/å/g, 'a')
		.replace(/ä/g, 'a')
		.replace(/ö/g, 'o')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/^-+|-+$/g, '');

const getImageDirectory = () => {
	const configured = process.env.REVIEW_IMAGE_DIR?.trim();
	if (configured) {
		return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
	}
	if (process.env.NODE_ENV === 'production') {
		return '/app/uploads/images';
	}
	return join(process.cwd(), 'static', 'images');
};

const randomRatings = () =>
	Object.fromEntries(
		Object.keys(RATING_WEIGHTS).map((key) => [key, randInt(key === 'soundLevel' ? 1 : 2, 5)])
	);

const buildBar = (index, author, usedSlugs, now) => {
	let title;
	let slug;
	do {
		title = `${rand(PLACES)} ${rand(TYPES)}`;
		slug = generateSlug(title);
	} while (usedSlugs.has(slug));
	usedSlugs.add(slug);

	const ratings = randomRatings();
	// Spread createdAt so the "latest"/"oldest" sort has something to work with.
	const createdAt = new Date(now.getTime() - index * 60 * 60 * 1000);

	return {
		_id: new ObjectId(),
		title,
		description: rand(DESCRIPTIONS),
		...ratings,
		rating: calculateOverallRating(ratings),
		image: `${new ObjectId().toHexString()}.png`,
		imageFocusX: DEFAULT_IMAGE_FOCUS,
		imageFocusY: DEFAULT_IMAGE_FOCUS,
		location: `${rand(STREETS)} ${randInt(1, 140)}, Stockholm`,
		slug,
		beerPriceKr: randInt(55, 89),
		isHappyHourPrice: Math.random() < 0.4,
		author,
		coAuthors: [],
		changeLog: [],
		createdAt,
		updatedAt: createdAt
	};
};

const parseArgs = (argv) => {
	const options = { count: DEFAULT_COUNT, author: null, fresh: false };
	const positionals = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--fresh') {
			options.fresh = true;
		} else if (arg === '--author') {
			options.author = argv[++i] ?? null;
		} else if (arg.startsWith('--author=')) {
			options.author = arg.slice('--author='.length);
		} else {
			positionals.push(arg);
		}
	}

	if (positionals.length > 0) {
		const parsed = Number(positionals[0]);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			console.error('❌ Count must be a positive integer');
			process.exit(1);
		}
		options.count = parsed;
	}

	return options;
};

async function seedBars() {
	const { count, author: requestedAuthor, fresh } = parseArgs(process.argv.slice(2));

	const imageDirectory = getImageDirectory();
	try {
		mkdirSync(imageDirectory, { recursive: true });
	} catch (err) {
		console.error('❌ Could not create image directory:', imageDirectory, err.message);
		process.exit(1);
	}

	let client;
	try {
		client = new MongoClient(MONGO_URI);
		await client.connect();
		console.log('✓ Connected to MongoDB');

		const db = client.db('enstorstark');
		const barsCollection = db.collection('bars');
		const usersCollection = db.collection('users');

		// Pick an author: the requested one, else the first existing user, else 'test'.
		let author = requestedAuthor;
		if (author) {
			const exists = await usersCollection.findOne({ username: author.toLowerCase() });
			if (!exists) {
				console.error(`❌ Author "${author}" does not exist. Create the user first.`);
				process.exit(1);
			}
			author = author.toLowerCase();
		} else {
			const firstUser = await usersCollection.findOne({}, { sort: { _id: 1 } });
			author = firstUser?.username ?? 'test';
		}
		console.log(`✓ Authoring reviews as "${author}"`);

		if (fresh) {
			const deleted = await barsCollection.deleteMany({});
			console.log(`🧹 Removed ${deleted.deletedCount} existing bar(s)`);
		}

		const now = new Date();
		const usedSlugs = new Set();
		let created = 0;
		let skipped = 0;

		for (let i = 0; i < count; i++) {
			const bar = buildBar(i, author, usedSlugs, now);
			try {
				await barsCollection.insertOne(bar);
			} catch (err) {
				if (err && err.code === 11000) {
					skipped++;
					console.log(`  ~ Skipped "${bar.title}" (slug already exists)`);
					continue;
				}
				throw err;
			}

			// Only write the image once the row is committed, so skipped
			// duplicates never leave orphaned files behind.
			copyFileSync(EXAMPLE_IMAGE_PATH, join(imageDirectory, bar.image));
			created++;
			console.log(`  + ${bar.title}  (/${bar.slug})`);
		}

		console.log('');
		console.log(`✓ Done. Created ${created} bar(s), skipped ${skipped}.`);
		console.log(`  Images written to: ${imageDirectory}`);
	} catch (error) {
		console.error('❌ Error seeding bars:', error.message);
		process.exit(1);
	} finally {
		if (client) {
			await client.close();
			console.log('✓ Database connection closed');
		}
	}
}

console.log('Seeding bars...');
console.log('');
seedBars();
