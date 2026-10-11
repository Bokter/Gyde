#!/bin/sh
set -e

echo "Running database migrations..."
node -e "
const { connectPostgres } = require('./src/infrastructure/db/database');
const { runMigrations } = require('./src/infrastructure/db/migrate');
const { resolveMigrationsFolder } = require('./src/infrastructure/db/database');

const db = connectPostgres(process.env.WEB_DATABASE_URL);
runMigrations(db.db, resolveMigrationsFolder())
  .then(() => {
    console.log('Migrations applied successfully');
    require('./server.js');
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
"