#!/usr/bin/env node

/**
 * Script to seed the database with demo bar reviews.
 *
 * Creates a batch of bars in one go so a fresh database has something to show.
 * The example image at src/lib/images/image.png is copied into the upload
 * directory once per bar (with a unique ObjectId filename) so every seeded
 * review renders with a picture.
 *
 * Usage:
 *   node scripts/seed-bars.js [count] [--author <username>] [--fresh]
 *
 * Examples:
 *   node scripts/seed-bars.js              # 20 bars, authored by an existing user
 *   node scripts/seed-bars.js 12           # 12 bars
 *   node scripts/seed-bars.js --author dj  # author every bar as "dj"
 *   node scripts/seed-bars.js --fresh      # remove previously seeded bars first
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

// Curated demo bars. Ratings are on a 0-5 scale per metric.
const BAR_TEMPLATES = [
	{
		title: 'Kvarterskrogen Ekot',
		location: 'Bondegatan 12, Stockholm',
		beerPriceKr: 68,
		isHappyHourPrice: false,
		description:
			'Mysig hörnkrog på Söder med avslappnad stämning och personal som faktiskt bryr sig. Ölen håller bra kvalitet och priset är helt okej för läget.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 3,
			quality: 4,
			price: 3,
			cleanliness: 4,
			soundLevel: 4,
			barhopPotential: 3
		}
	},
	{
		title: 'Bryggan 8',
		location: 'Hornsgatan 88, Stockholm',
		beerPriceKr: 72,
		isHappyHourPrice: false,
		description:
			'Stort utbud av lokala mikrobryggerier och en engagerad personal. Kan bli trångt en fredagskväll men värt det för utbudets skull.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 5,
			quality: 5,
			price: 3,
			cleanliness: 4,
			soundLevel: 2,
			barhopPotential: 4
		}
	},
	{
		title: 'Röda Lyktan',
		location: 'Götgatan 45, Stockholm',
		beerPriceKr: 59,
		isHappyHourPrice: true,
		description:
			'Prisvärt och opretentiöst. Inte den finaste inredningen men happy hour gör susen och det är alltid lätt att hoppa vidare härifrån.',
		ratings: {
			atmosphere: 3,
			service: 3,
			selection: 3,
			quality: 3,
			price: 5,
			cleanliness: 3,
			soundLevel: 3,
			barhopPotential: 5
		}
	},
	{
		title: 'Malörten',
		location: 'Sankt Eriksgatan 33, Stockholm',
		beerPriceKr: 79,
		isHappyHourPrice: false,
		description:
			'Sofistikerad cocktail- och ölbar med hög kvalitet rakt igenom. Lite dyrare, men servicen och atmosfären matchar priset.',
		ratings: {
			atmosphere: 5,
			service: 5,
			selection: 4,
			quality: 5,
			price: 2,
			cleanliness: 5,
			soundLevel: 3,
			barhopPotential: 2
		}
	},
	{
		title: 'Skeppsbron Pub',
		location: 'Skeppsbron 20, Stockholm',
		beerPriceKr: 75,
		isHappyHourPrice: false,
		description:
			'Klassisk pub med utsikt över vattnet. Turistigt men ölen är kall och personalen snabb. Bra första stopp på en runda.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 3,
			quality: 4,
			price: 3,
			cleanliness: 4,
			soundLevel: 3,
			barhopPotential: 4
		}
	},
	{
		title: 'Källaren Vasa',
		location: 'Upplandsgatan 7, Stockholm',
		beerPriceKr: 64,
		isHappyHourPrice: true,
		description:
			'Nedgrävd källarbar med skön akustik och lågmäld stämning. Perfekt för ett långt samtal över en stor stark.',
		ratings: {
			atmosphere: 4,
			service: 3,
			selection: 3,
			quality: 4,
			price: 4,
			cleanliness: 4,
			soundLevel: 5,
			barhopPotential: 2
		}
	},
	{
		title: 'Humlegården Tap Room',
		location: 'Karlavägen 100, Stockholm',
		beerPriceKr: 82,
		isHappyHourPrice: false,
		description:
			'Renodlad tap room med ständigt roterande kranar. Ölnördens dröm, men prisvärdheten kan diskuteras.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 5,
			quality: 5,
			price: 2,
			cleanliness: 5,
			soundLevel: 3,
			barhopPotential: 3
		}
	},
	{
		title: 'Fyren & Ankaret',
		location: 'Folkungagatan 122, Stockholm',
		beerPriceKr: 66,
		isHappyHourPrice: false,
		description:
			'Sjaskig charm och stamgäster i baren. Inget märkvärdigt men ärligt och prisvärt, och nära allt annat på Söder.',
		ratings: {
			atmosphere: 3,
			service: 3,
			selection: 2,
			quality: 3,
			price: 4,
			cleanliness: 3,
			soundLevel: 3,
			barhopPotential: 5
		}
	},
	{
		title: 'Nortulls Ölhall',
		location: 'Sveavägen 140, Stockholm',
		beerPriceKr: 61,
		isHappyHourPrice: true,
		description:
			'Stor och högljudd ölhall med långbord. Bäst i sällskap. Ölen flödar och priset är snällt, men glöm intima samtal.',
		ratings: {
			atmosphere: 4,
			service: 3,
			selection: 4,
			quality: 3,
			price: 4,
			cleanliness: 3,
			soundLevel: 1,
			barhopPotential: 4
		}
	},
	{
		title: 'Den Gyllene Humlen',
		location: 'Odengatan 65, Stockholm',
		beerPriceKr: 74,
		isHappyHourPrice: false,
		description:
			'Välskött grannskapsbar med genomtänkt ölmeny och trevlig personal. En pålitlig favorit året runt.',
		ratings: {
			atmosphere: 4,
			service: 5,
			selection: 4,
			quality: 4,
			price: 3,
			cleanliness: 5,
			soundLevel: 4,
			barhopPotential: 3
		}
	},
	{
		title: 'Slussens Skänk',
		location: 'Katarinavägen 15, Stockholm',
		beerPriceKr: 69,
		isHappyHourPrice: false,
		description:
			'Läge, läge, läge. Utsikten är oslagbar och ölen fullt godkänd. Kom före solnedgången för bästa upplevelsen.',
		ratings: {
			atmosphere: 5,
			service: 3,
			selection: 3,
			quality: 3,
			price: 3,
			cleanliness: 4,
			soundLevel: 3,
			barhopPotential: 4
		}
	},
	{
		title: 'Bryggeriet Kaj 4',
		location: 'Stadsgårdshamnen 4, Stockholm',
		beerPriceKr: 85,
		isHappyHourPrice: false,
		description:
			'Bryggeri och bar i samma lokal. Färskaste tänkbara öl direkt från tanken. Dyrt, men kvaliteten är i toppklass.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 4,
			quality: 5,
			price: 2,
			cleanliness: 5,
			soundLevel: 2,
			barhopPotential: 2
		}
	},
	{
		title: 'Tantolundens Terrass',
		location: 'Ringvägen 12, Stockholm',
		beerPriceKr: 63,
		isHappyHourPrice: true,
		description:
			'Uteservering i parkkanten som är magisk på sommaren. Enkel meny men oslagbar stämning när solen är framme.',
		ratings: {
			atmosphere: 5,
			service: 3,
			selection: 2,
			quality: 3,
			price: 4,
			cleanliness: 3,
			soundLevel: 3,
			barhopPotential: 4
		}
	},
	{
		title: 'Gamla Stans Krog',
		location: 'Västerlånggatan 50, Stockholm',
		beerPriceKr: 78,
		isHappyHourPrice: false,
		description:
			'Anrik krog i valvbågarna. Charmig men lite turistig, och priset speglar adressen mer än ölen.',
		ratings: {
			atmosphere: 4,
			service: 3,
			selection: 3,
			quality: 3,
			price: 2,
			cleanliness: 4,
			soundLevel: 3,
			barhopPotential: 3
		}
	},
	{
		title: 'Vasastans Vattenhål',
		location: 'Dalagatan 28, Stockholm',
		beerPriceKr: 60,
		isHappyHourPrice: true,
		description:
			'Enkel stambar utan pretentioner. Billig öl, snabb service och alltid någon att prata med. Perfekt vardagsöl.',
		ratings: {
			atmosphere: 3,
			service: 4,
			selection: 2,
			quality: 3,
			price: 5,
			cleanliness: 3,
			soundLevel: 3,
			barhopPotential: 4
		}
	},
	{
		title: 'Kungsholmens Källare',
		location: 'Fleminggatan 41, Stockholm',
		beerPriceKr: 70,
		isHappyHourPrice: false,
		description:
			'Ombonad källarlokal med bra bredd på fatölen. Lagom stökigt och helt rätt för en fredagsstart.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 4,
			quality: 4,
			price: 3,
			cleanliness: 4,
			soundLevel: 3,
			barhopPotential: 4
		}
	},
	{
		title: 'Hornstulls Hörna',
		location: 'Långholmsgatan 20, Stockholm',
		beerPriceKr: 65,
		isHappyHourPrice: true,
		description:
			'Ung publik och skön musik. Ölen är standard men stämningen och happy hour drar upp helhetsbetyget rejält.',
		ratings: {
			atmosphere: 4,
			service: 3,
			selection: 3,
			quality: 3,
			price: 4,
			cleanliness: 3,
			soundLevel: 2,
			barhopPotential: 5
		}
	},
	{
		title: 'Observatoriets Ölbar',
		location: 'Drottninggatan 120, Stockholm',
		beerPriceKr: 77,
		isHappyHourPrice: false,
		description:
			'Stilren bar med kuraterad meny och kunnig personal. Rogivande tempo och hög kvalitet, men inte billigast.',
		ratings: {
			atmosphere: 4,
			service: 5,
			selection: 4,
			quality: 5,
			price: 2,
			cleanliness: 5,
			soundLevel: 4,
			barhopPotential: 2
		}
	},
	{
		title: 'Söders Sista Sup',
		location: 'Skånegatan 79, Stockholm',
		beerPriceKr: 58,
		isHappyHourPrice: true,
		description:
			'Sista anhalten innan hemgång. Öppet sent, billig öl och en garanterat blandad kompott av gäster. Charmigt slitet.',
		ratings: {
			atmosphere: 3,
			service: 3,
			selection: 2,
			quality: 2,
			price: 5,
			cleanliness: 2,
			soundLevel: 2,
			barhopPotential: 5
		}
	},
	{
		title: 'Norrmalms Nubbe & Öl',
		location: 'Kungsgatan 55, Stockholm',
		beerPriceKr: 73,
		isHappyHourPrice: false,
		description:
			'Klassisk mat- och ölkrog mitt i city. Solitt hantverk, jämn kvalitet och en meny som sällan gör dig besviken.',
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 4,
			quality: 4,
			price: 3,
			cleanliness: 4,
			soundLevel: 3,
			barhopPotential: 3
		}
	},
	{
		title: 'Liljeholmens Lager',
		location: 'Liljeholmsvägen 18, Stockholm',
		beerPriceKr: 62,
		isHappyHourPrice: true,
		description:
			'Grannskapets självklara vattenhål. Ingenting sticker ut men allt fungerar, och priset är svårslaget.',
		ratings: {
			atmosphere: 3,
			service: 4,
			selection: 3,
			quality: 3,
			price: 4,
			cleanliness: 4,
			soundLevel: 4,
			barhopPotential: 3
		}
	},
	{
		title: 'Djurgårdens Brygghus',
		location: 'Djurgårdsvägen 60, Stockholm',
		beerPriceKr: 84,
		isHappyHourPrice: false,
		description:
			'Naturskönt läge och egenbryggt på fat. En utflykt värd priset, särskilt en solig eftermiddag.',
		ratings: {
			atmosphere: 5,
			service: 4,
			selection: 4,
			quality: 5,
			price: 2,
			cleanliness: 5,
			soundLevel: 4,
			barhopPotential: 2
		}
	},
	{
		title: 'Medborgarplatsens Mält',
		location: 'Medborgarplatsen 3, Stockholm',
		beerPriceKr: 67,
		isHappyHourPrice: false,
		description:
			'Alltid full fart och lätt att träffa folk. Ölen är helt okej och läget är oslagbart för en barrunda på Söder.',
		ratings: {
			atmosphere: 4,
			service: 3,
			selection: 3,
			quality: 3,
			price: 3,
			cleanliness: 3,
			soundLevel: 2,
			barhopPotential: 5
		}
	},
	{
		title: 'Zinkensdamms Zink',
		location: 'Ringvägen 16, Stockholm',
		beerPriceKr: 66,
		isHappyHourPrice: true,
		description:
			'Avslappnad sportbar med stor zinkdisk. Bäst på matchkvällar, men trevlig även för ett lugnt glas.',
		ratings: {
			atmosphere: 3,
			service: 4,
			selection: 3,
			quality: 3,
			price: 4,
			cleanliness: 3,
			soundLevel: 2,
			barhopPotential: 4
		}
	}
];

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

const buildBar = (template, index, author, now) => {
	// Give each seeded bar a distinct name/slug even beyond the template list.
	const suffix =
		index >= BAR_TEMPLATES.length ? ` ${Math.floor(index / BAR_TEMPLATES.length) + 1}` : '';
	const title = `${template.title}${suffix}`;
	const slug = generateSlug(title);

	const imageFilename = `${new ObjectId().toHexString()}.png`;

	// Spread createdAt so the "latest"/"oldest" sort has something to work with.
	const createdAt = new Date(now.getTime() - index * 60 * 60 * 1000);

	return {
		_id: new ObjectId(),
		title,
		description: template.description,
		...template.ratings,
		rating: calculateOverallRating(template.ratings),
		image: imageFilename,
		imageFocusX: DEFAULT_IMAGE_FOCUS,
		imageFocusY: DEFAULT_IMAGE_FOCUS,
		location: template.location,
		slug,
		beerPriceKr: template.beerPriceKr,
		isHappyHourPrice: template.isHappyHourPrice,
		author,
		coAuthors: [],
		changeLog: [],
		createdAt,
		updatedAt: createdAt
	};
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
		let created = 0;
		let skipped = 0;

		for (let i = 0; i < count; i++) {
			const template = BAR_TEMPLATES[i % BAR_TEMPLATES.length];
			const bar = buildBar(template, i, author, now);
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
