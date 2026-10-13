#!/bin/sh
set -e

node dist/migrate/migrate-cli.mjs

exec node server.js
