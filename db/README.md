# Simple Docker setup for development MongoDB

This folder contains a small MongoDB Docker setup for local development.

`make dev` in the repository root already starts this database together with the app, and
needs no Node.js on the host. The commands below are for running only the database, with
the app started separately through npm.

## Run from repo root

The easiest way is to run the npm scripts from the repository root:

```bash
npm run db:all
```

Available commands:

- `npm run db:build` - build MongoDB image
- `npm run db:run` - run container with persistent volume
- `npm run db:prepare` - ensure the `admin` user with password `administrator` exists
- `npm run db:all` - run + prepare
- `npm run db:clean` - stop container and remove image
- `npm run db:reset` - clean + delete persistent volume

The underlying Makefile still exists in this folder and can also be called directly.

## Production compose auth

The root `docker-compose.yml` is configured for authenticated MongoDB in deployment scenarios.

Required variables are documented in `.env.example`:

- `MONGO_ROOT_USERNAME`
- `MONGO_ROOT_PASSWORD`
- `APP_MONGO_URI`

Example flow from repo root:

```bash
cp .env.example .env
# edit .env with strong secrets
docker compose up -d --build
```

Note: with authentication enabled, any script/tool connecting to MongoDB must use a URI with credentials and `authSource=admin`.

## Persistence behavior

Container data is stored in a Docker volume: `enstorstark-mongodb-data`.

- Use `db:clean` if you want to keep database data.
- Use `db:reset` if you want a full wipe and fresh initialization.

## Demo users from init.js

`init.js` is copied to `/docker-entrypoint-initdb.d/` and is executed by MongoDB's entrypoint on first initialization of a fresh data directory.

Seeded demo users:

- `dj` / `jaeger123`
- `test` / `testpass123`

These passwords are development-only and are stored as Argon2 hashes in the database.

## Dockerfile

The Dockerfile only copies `init.js` into the Mongo image startup folder and otherwise uses the official `mongo:7` image.
