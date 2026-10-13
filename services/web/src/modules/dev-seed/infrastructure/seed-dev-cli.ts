import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import { DrizzleDevSeedStore } from './drizzle-dev-seed-store';
import { runSeedDev } from './seed-dev';

/** Entry point of `pnpm --filter web seed:dev` (run with tsx; not part of the Docker image). */
void runSeedDev({
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  openStore: (connectionString) => {
    const pool = new Pool({ connectionString });
    return { store: new DrizzleDevSeedStore(drizzle(pool, { schema })), close: () => pool.end() };
  },
}).then((code) => {
  process.exitCode = code;
});
