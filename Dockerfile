FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set ignore-scripts false && npm ci

COPY . .

ARG MONGO_URI
ENV MONGO_URI=$MONGO_URI

RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node --from=build /app/scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p static/images \
	&& chown -R node:node /app \
	&& chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]