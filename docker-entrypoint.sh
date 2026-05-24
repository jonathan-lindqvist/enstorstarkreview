#!/bin/sh
set -eu

mkdir -p /app/build/client/images
chown -R node:node /app/build/client/images

exec su node -s /bin/sh -c 'cd /app && exec node build'
