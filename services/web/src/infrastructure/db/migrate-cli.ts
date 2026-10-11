import { connectPostgres } from './database';

/**
 * Command-line entry point of the migration runner: `docker-entrypoint.sh` runs the compiled
 * bundle (`dist/migrate/migrate-cli.mjs`) and `pnpm migrate` runs this file with tsx.
 *
 * A missing `WEB_DATABASE_URL` is an error (exit 1) so a production start never skips the
 * migrations by accident. Local development passes `--skip-if-no-db` to warn and carry on instead.
 */
const SKIP_IF_NO_DB = '--skip-if-no-db';

function log(message: string): void {
  process.stdout.write(`[migrate] ${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`[migrate] ${message}\n`);
}

async function main(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const connectionString = env.WEB_DATABASE_URL;
  if (!connectionString) {
    if (args.includes(SKIP_IF_NO_DB)) {
      logError('WEB_DATABASE_URL is not set: skipping migrations (--skip-if-no-db).');
      return 0;
    }
    logError('WEB_DATABASE_URL is not set: cannot run migrations.');
    return 1;
  }

  const database = connectPostgres(connectionString);
  try {
    log('Applying database migrations...');
    await database.migrate();
    log('Migrations are up to date.');
    return 0;
  } catch (error) {
    logError(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await database.close();
  }
}

void main(process.argv.slice(2), process.env).then((code) => {
  process.exitCode = code;
});
