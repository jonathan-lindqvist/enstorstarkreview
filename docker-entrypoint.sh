#!/bin/sh
set -eu

mkdir -p /app/static/images
chown -R node:node /app/static/images

exec su node -s /bin/sh -c 'cd /app && exec node build'