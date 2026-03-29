# Simple docker setup for development MongoDB

To ease the setup for a MongoDB instance for development purposes this can be used for a simple DB. The included Makefile will build and start a mongodb container listening on port `27017`. This can be done by running `make all`.

The `init.js` is placed in `/docker-entrypoint-initdb.d/` which as can be seen here: [https://hub.docker.com/\_/mongo#environment-variables](https://hub.docker.com/_/mongo#environment-variables) will run on startup. This can be used to create some sample users but the `prepare` also does that with the `npm run create-user <user> <password>`.

## Dockerfile
The `Dockerfile` is only copying the `init.js` to the entrypoint and the rest is taken from the official mongo-image.

