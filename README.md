# Bar Review Application

A collaborative bar review platform where users can create and share reviews of bars. All users
who are created in the system can log in, create private drafts, and edit or publish reviews.
Anonymous visitors see only published reviews.

## Setup

Two ways to run the app locally. Either way the site ends up on <http://localhost:5173>
with a MongoDB seeded with demo users, so you can log in as `test` / `testpass123` right
away.

### Everything in Docker

Needs only Docker. No Node.js and no `.env`:

```bash
make dev
```

Editing a file reloads the browser. `make dev-down` stops it, and `make help` lists the
rest: reset the database, run the tests, open a shell, create a user.

Without `make`, the command is `docker compose -f docker-compose.dev.yml up --build`.

### On your machine

Needs Node.js `^20.19.0 || >=22.12.0`, plus Docker for the database. The app refuses to
start without `MONGO_URI`, so create a `.env` file first (it is gitignored):

```
MONGO_URI=mongodb://localhost:27017/enstorstark
```

Then:

```bash
npm install
npm run db:all   # MongoDB in Docker, seeded with the demo users
npm run dev
```

`npm run dev` starts only the native Vite process; it does not start MongoDB. If it reports
`ECONNREFUSED 127.0.0.1:27017`, run `npm run db:all` first and leave that database container
running.

`npm run dev -- --open` opens a browser, `npm run build` makes a production build, and
[db/README.md](db/README.md) has the other database commands.

## Deployment with Docker

The repository includes a production app image and a MongoDB container based on `db/Dockerfile`.

`docker-compose.yml` is for deployment only: it expects secrets in `.env`, publishes no
ports, and attaches to an external reverse proxy network. To run the app locally, use
`make dev` from [Setup](#setup) instead.

Before first start, create a `.env` file from `.env.example` and set strong credentials:

```bash
cp .env.example .env
```

Then edit `.env` and set at minimum:

- `MONGO_ROOT_USERNAME`
- `MONGO_ROOT_PASSWORD`
- `APP_MONGO_URI` (should include `authSource=admin`)

The app build also needs `MONGO_URI` to exist at image build time, but it does not need live production credentials. The compose file uses a non-secret placeholder build arg and passes the real connection string only as runtime env.

The compose file also pins stable container names for the app and MongoDB so the reverse proxy and maintenance commands do not change when the Compose project name changes.

```bash
docker compose up --build
```

That brings up the app and database together. The app listens on port 3000 inside the Docker network, which makes it suitable for routing from a separate infra repo or reverse proxy stack. Uploaded images are stored in a named Docker volume so they survive container restarts.

MongoDB authentication is enabled in this compose setup. The app must connect using credentials through `APP_MONGO_URI`.

If you are wiring this app to a separate Caddy stack, attach the app to the shared external Docker network named `caddy_net`.

The site also includes a minimal Google Analytics consent banner. It uses Google Consent Mode, so visits can still be measured in a limited way.

The app image prepares the upload directory during image build and runs the SvelteKit server directly as the non-root `node` user.

`TRUST_PROXY` is enabled in the compose stack so the app can respect forwarded client IP headers from your external proxy.

If your infra repo provides a reverse proxy, point it at the `app` service on port 3000 and route whichever host or path you need there.

### Image storage

Uploaded bar images are written at runtime to `/app/uploads/images` in the production container. In the Docker setup, that path is backed by the named volume `app-images`, so the files persist across image rebuilds and container recreation as long as you keep the volume.

The `/images/<filename>` route validates the persisted filename and authorizes it through the
review that references it before reading from the upload directory. Images belonging to published
or legacy reviews are public and use immutable caching. Draft images require authentication and
use private, no-store caching.

Avoid `docker compose down -v` or manually deleting the `app-images` volume if you want to keep uploaded files.

## Testing

The project includes unit tests (Vitest) and integration tests (Playwright).

### Run all tests

```bash
npm test
# or
yarn test
```

### Run unit tests only

```bash
npm run test:unit
# or
yarn test:unit
```

### Run integration tests only

```bash
npm run test:integration
# or
yarn test:integration
```

### What is covered by unit tests

- Slug generation helpers
- Overall rating calculation logic
- Review form sanitization and validation helpers
- Image MIME and file signature validation
- Request IP extraction behavior
- Audit logging normalization and error handling
- Login rate-limit behavior

## User Management

All users must be created in the system before they can log in and create reviews. Users are created either via a script or direct database insertion.

### Creating Users via Script

Use the provided script to create new users:

```bash
npm run create-user <username> <password>
```

When running against an authenticated MongoDB, set `MONGO_URI` with credentials before running the script:

```bash
MONGO_URI='mongodb://<user>:<password>@mongo:27017/enstorstark?authSource=admin' npm run create-user <username> <password>
```

**Examples:**

```bash
npm run create-user johan_2024 lösenord123
npm run create-user erik-review hemligt456
npm run create-user sara_barlog password789
```

**Username Requirements:**

- 3-31 characters
- Only lowercase letters, numbers, hyphens (-), and underscores (\_)
- Cannot include spaces or special characters

**Password Requirements:**

- Minimum 6 characters
- Maximum 255 characters

### Creating Users via Direct Database Insertion

You can also insert users directly into MongoDB. Each user must have:

- `_id`: A unique ObjectId
- `username`: Unique lowercase username (3-31 characters, alphanumeric + - and \_)
- `password`: Argon2-hashed password

```javascript
// Example MongoDB insertion (requires Argon2 hashing)
db.users.insertOne({
	_id: ObjectId(),
	username: 'johan_2024',
	password: '$argon2id$v=19$m=19456,t=2,p=1$...' // hashed password
});
```

### User Roles

All created users have the same permissions:

- Can log in to the application
- Can create new bar reviews as private drafts
- Can edit any existing bar review
- Can view and publish any draft
- Can select other users as co-authors when creating/editing reviews

Editing is collaborative: the user who saves an edit becomes the primary author, and the
previous primary author is retained as a co-author.

Publishing is also collaborative and one-way: the user who publishes becomes the primary author,
and the previous primary author is retained as a co-author. There is no role system or unpublish
action.

## Seeding Demo Bars

Fill the development database with random demo bars (default 20). The Docker development
database creates the `dj` and `test` users when its Mongo volume is first initialized.

With the Docker development stack:

```bash
make dev-seed
make dev-seed COUNT=12
make dev-seed COUNT=12 FRESH=1
```

On your machine with `MONGO_URI` configured:

```bash
npm run seed-bars
npm run seed-bars -- 12
npm run seed-bars -- 12 --fresh
```

`FRESH=1` is only for the Make command; `--fresh` is only for the npm/script command.
Fresh mode deletes every existing bar before creating the demo bars. Seeding is disabled
when `NODE_ENV=production` and stops without changing bars if the database contains no
users. Seeded reviews are explicitly public.

## Creating Reviews

1. Log in at `/login` with your username and password
2. Navigate to `/admin/reviews` to access the review creation form
3. Fill in the review details:

   - **Barens namn** (Bar Name)
   - **Adress** (Address)
   - **Medförfattare** (Co-Authors): Select other users who contributed to the review using the checkboxes
   - **Bild** (Image): Upload an image of the bar
   - **Din recension** (Description): Write your detailed review
   - **Betygsätt din upplevelse** (Ratings): Rate aspect 0-5 scale

4. Click **Spara utkast**. The fully validated review is saved as a private draft.
5. Open the draft detail page and click **Publicera recension** when it is ready for everyone.

All authenticated users can see drafts on the home page and management list. Amber **Utkast** and
green **Publicerad** badges make their status visible. Anonymous visitors cannot find drafts in
home/search or open their detail, history, or image URLs.

Reviews created before draft support have no `publicationStatus` field. They remain public and
editable without a migration; a missing status is interpreted as published.

## Editing Reviews

1. Go to a review page (drafts are visible only while logged in)
2. Log in and click "Redigera" (Edit); any authenticated user can edit the review
3. Modify the review details and co-author assignments
4. Click submit to save changes; you become the primary author and the previous primary
   author remains a co-author

## Project Structure

- `/src/routes/` - Page routes including admin panels
- `/src/lib/components/` - Reusable Svelte components
- `/src/lib/db/` - Database collections
- `/src/lib/types/` - TypeScript type definitions
- `/uploads/images/` - Local development image uploads (kept outside `static` so every request is authorized)
- `/scripts/` - Utility scripts for database management

## Technology Stack

- **Framework**: SvelteKit
- **Language**: TypeScript
- **Database**: MongoDB
- **Authentication**: Lucia
- **Password Hashing**: Argon2
- **Styling**: Tailwind CSS
