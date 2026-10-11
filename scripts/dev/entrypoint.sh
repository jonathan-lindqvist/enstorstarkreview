#!/bin/sh
set -eu
node /app/scripts/dev/sync-dependencies.js
exec "$@"
