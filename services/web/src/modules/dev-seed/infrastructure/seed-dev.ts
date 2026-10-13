import type { DevSeedStore } from '../application/ports/dev-seed-store';
import { assertNotProduction, SeedDevTenant } from '../application/seed-dev-tenant';

export interface SeedDevIo {
  env: NodeJS.ProcessEnv;
  /** Receives only the plain API key, once. */
  stdout: (text: string) => void;
  /** Every other message; never the key. */
  stderr: (text: string) => void;
  openStore: (connectionString: string) => { store: DevSeedStore; close: () => Promise<void> };
}

/** `pnpm --filter web seed:dev`: returns the process exit code. */
export async function runSeedDev({ env, stdout, stderr, openStore }: SeedDevIo): Promise<number> {
  const say = (message: string) => stderr(`[seed:dev] ${message}\n`);

  try {
    assertNotProduction(env.NODE_ENV);
  } catch (error) {
    say(`Refused: ${(error as Error).message}.`);
    return 1;
  }
  if (!env.WEB_DATABASE_URL) {
    say('WEB_DATABASE_URL is not set.');
    return 1;
  }

  const { store, close } = openStore(env.WEB_DATABASE_URL);
  try {
    const result = await new SeedDevTenant(store).execute({ nodeEnv: env.NODE_ENV });
    if (result.status === 'already-exists') {
      say(
        `Tenant ${result.slug} (${result.tenantId}, plan ${result.plan}) already exists: nothing created. ` +
          'Its API key cannot be printed again because only its hash is stored; ' +
          'to get a new one, delete the tenant (its keys go with it) and run seed:dev again.',
      );
      return 0;
    }
    say(
      `Created tenant ${result.slug} (${result.tenantId}, plan ${result.plan}) with a test API key.`,
    );
    say('Copy the key below now: it is shown only this once.');
    stdout(`${result.plainKey}\n`);
    return 0;
  } catch (error) {
    say(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    say('If the tables are missing, run `pnpm --filter web migrate` first.');
    return 1;
  } finally {
    await close();
  }
}
