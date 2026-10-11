#!/bin/sh
set -e

echo "Running database migrations..."
node --enable-source-maps dist/migrate/migrate.js
if [ $? -ne 0 ]; then
  echo "Migration failed"
  exit 1
fi

echo "Starting server..."
exec node server.js