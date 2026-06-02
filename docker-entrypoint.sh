#!/bin/sh
set -eu

mkdir -p /app/uploads/images
chown -R node:node /app/uploads/images

exec su node -s /bin/sh -c 'cd /app && exec node build'
