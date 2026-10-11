#!/bin/sh
set -e

echo "Running database migrations..."
node dist/migrate/migrate.js
if [ $? -ne 0 ]; then
  echo "Migration failed"
  exit 1
fi

echo "Migrations completed successfully"