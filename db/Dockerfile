FROM mongo:7 AS base

COPY init.js /docker-entrypoint-initdb.d/

FROM base AS development

COPY seed-dev-users.js /docker-entrypoint-initdb.d/

# Keep the default image free of application users, even without --target.
FROM base AS production

