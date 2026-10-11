import { defineConfig } from 'drizzle-kit';

/** Generates the SQL migrations: `pnpm --filter @gyde/normalization db:generate` (no database needed). */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
});
